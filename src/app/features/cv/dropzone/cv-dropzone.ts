import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { CV_ACCEPT_ATTRIBUTE, formatLabel, formatListLabel, humanFileSize } from '../cv-file';
import { CvImportService, describeProgress } from '../import/cv-import.service';

let nextId = 0;

/**
 * Drag-and-drop zone for the base CV.
 *
 * The zone is not a `<div>` with a click handler (a11y-audit checklist §1): it is
 * a real `<input type="file">` stretched over the whole surface, so the pointer
 * target, the keyboard target, the screen-reader announcement and the drop
 * handler are one element. Everything visible inside is decorative.
 */
@Component({
  selector: 'app-cv-dropzone',
  templateUrl: './cv-dropzone.html',
  styleUrl: './cv-dropzone.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvDropzone implements OnDestroy {
  private readonly i18n = inject(I18n);
  protected readonly cvImport = inject(CvImportService);

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly zone = viewChild.required<ElementRef<HTMLElement>>('zone');
  private readonly errorBox = viewChild<ElementRef<HTMLElement>>('errorBox');

  protected readonly accept = CV_ACCEPT_ATTRIBUTE;
  // Unique per instance, so a second dropzone would not fight over the ids that
  // `for`, `aria-describedby` and the live region depend on.
  protected readonly uid = `cv-dropzone-${nextId++}`;
  protected readonly inputId = `${this.uid}-input`;
  protected readonly hintId = `${this.uid}-hint`;
  protected readonly statusId = `${this.uid}-status`;

  /** Depth counter: `dragleave` also fires when the pointer crosses a child. */
  private dragDepth = 0;
  private readonly isDragActive = signal(false);

  protected readonly busy = this.cvImport.isBusy;

  protected readonly progressLabel = () => {
    const label = describeProgress(this.cvImport.pendingFileName(), this.cvImport.pageProgress());
    return label === null ? null : this.i18n.t('cv.dropzone.reading', { fileName: label });
  };

  protected readonly hint = () =>
    this.i18n.t('cv.dropzone.formats', {
      formats: formatListLabel(),
      maxSize: humanFileSize(this.cvImport.maxBytes),
    });

  protected readonly loadedMessage = () => {
    const cv = this.cvImport.cv();
    if (cv === null) {
      return null;
    }
    return this.i18n.t('cv.dropzone.loaded', {
      fileName: cv.fileName,
      // The number is formatted by the i18n layer, with the active locale.
      chars: cv.charCount,
      format: formatLabel(cv.format),
    });
  };

  protected readonly errorMessage = () => {
    const issue = this.cvImport.issue();
    return issue === null ? null : this.i18n.t(issue.messageKey, issue.params);
  };

  /**
   * Without this, a file dropped anywhere else in the window makes the browser
   * navigate to or download it, and the user loses the session.
   */
  constructor() {
    afterNextRender(() => this.#guardWindowDrop());
    effect(() => this.#focusNewError());
  }

  /**
   * `role="alert"` announces the error, but the keyboard cursor stays wherever it
   * was — on the scroll region, or nowhere visible — so a keyboard or screen
   * reader user is told what went wrong without being taken there
   * (a11y-audit checklist §4: "errors are announced and focus moves to them").
   */
  #focusNewError(): void {
    const message = this.errorMessage();

    if (!this.sawFirstRun) {
      // Only record the starting state. A component that renders with an issue
      // already set must not yank focus on load; what is worth moving the cursor
      // to is an error that appears while the user is on the page.
      this.sawFirstRun = true;
      this.focusedError = message;
      return;
    }

    if (message === null) {
      // Cleared: forget it, so the same message can move focus again later.
      this.focusedError = null;
      return;
    }
    if (message === this.focusedError) {
      return;
    }

    // Reading errorBox() subscribes this effect to the view, so a run that finds
    // no element yet leaves the error unfocused — and focusedError untouched —
    // and the run that finds it is the one that moves the focus.
    const box = this.errorBox()?.nativeElement;
    if (box === undefined) {
      return;
    }
    this.focusedError = message;
    box.focus();
  }

  private sawFirstRun = false;
  /** The error focus was last moved to; null when there is none or it cleared. */
  private focusedError: string | null = null;

  ngOnDestroy(): void {
    this.#removeWindowDropGuard();
  }

  /* ── Pointer / drag ─────────────────────────────────────────── */

  protected onDragEnter(event: DragEvent): void {
    if (!this.#carriesFiles(event) || this.busy()) {
      return;
    }
    event.preventDefault();
    this.dragDepth++;
    this.isDragActive.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.#carriesFiles(event) || this.busy()) {
      return;
    }
    // Required for the drop event to fire at all.
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDragLeave(event: DragEvent): void {
    if (!this.isDragActive()) {
      return;
    }
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) {
      this.isDragActive.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = 0;
    this.isDragActive.set(false);

    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.cvImport.import(file);
    }
  }

  /* ── Keyboard / file picker ─────────────────────────────────── */

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      void this.cvImport.import(file);
    }

    // Reset so re-picking the same file fires `change` again.
    input.value = '';
  }

  /** Reopening the native picker, e.g. from the "cambiar archivo" button. */
  protected openPicker(): void {
    if (!this.busy()) {
      this.input().nativeElement.click();
    }
  }

  protected onRetry(): void {
    this.cvImport.clearIssue();
    this.openPicker();
  }

  #carriesFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    return types ? Array.from(types).includes('Files') : false;
  }

  /* ── Window-level drop guard ────────────────────────────────── */

  #onWindowDragOver = (event: DragEvent): void => {
    if (this.#carriesFiles(event)) {
      event.preventDefault();
    }
  };

  #onWindowDrop = (event: DragEvent): void => {
    if (!this.#carriesFiles(event) || this.#landedOnZone(event)) {
      return;
    }
    event.preventDefault();
    this.dragDepth = 0;
    this.isDragActive.set(false);
  };

  /** `event.target` is not always a Node (a drop on the window itself is not). */
  #landedOnZone(event: DragEvent): boolean {
    const target = event.target;
    return target instanceof Node && this.zone().nativeElement.contains(target);
  }

  #guardWindowDrop(): void {
    window.addEventListener('dragover', this.#onWindowDragOver);
    window.addEventListener('drop', this.#onWindowDrop);
  }

  #removeWindowDropGuard(): void {
    window.removeEventListener('dragover', this.#onWindowDragOver);
    window.removeEventListener('drop', this.#onWindowDrop);
  }
}
