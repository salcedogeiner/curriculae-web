import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { WorkspaceService } from '../../../core/workspace/workspace.service';
import { LauncherPanel } from '../launcher-panel/launcher-panel';
import { LauncherService } from '../launcher.service';

/**
 * The launcher over the home page: a modal `<dialog>` that slides in from the
 * left. Being a real modal gives the focus trap, Escape and the inert page
 * behind it for free, and the browser returns focus to the menu button when
 * it closes. The home page underneath is never destroyed, so closing the
 * panel is going back to exactly what was there.
 *
 * The service holds the view; this component mirrors it onto the element and
 * reports every way the dialog closes itself (Escape, backdrop, back button)
 * through the `close` event.
 */
@Component({
  selector: 'app-launcher-drawer',
  imports: [LauncherPanel],
  templateUrl: './launcher-drawer.html',
  styleUrl: './launcher-drawer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LauncherDrawer {
  protected readonly i18n = inject(I18n);
  protected readonly launcher = inject(LauncherService);
  private readonly workspace = inject(WorkspaceService);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const open = this.launcher.drawerOpen();
      const dialog = this.dialog().nativeElement;
      untracked(() => {
        if (open && !dialog.open) {
          // The folder may have changed on disk since the panel was last open.
          void this.workspace.refresh();
          // jsdom has no showModal(); the attribute is enough for a test.
          if (typeof dialog.showModal === 'function') {
            dialog.showModal();
          } else {
            dialog.setAttribute('open', '');
          }
        } else if (!open && dialog.open) {
          this.dismiss();
        }
      });
    });
  }

  /** Closes the dialog now, synchronously; `onClose` then updates the service. */
  protected dismiss(): void {
    const dialog = this.dialog().nativeElement;
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    // A missing close() fires no `close` event either.
    this.onClose();
  }

  protected onClose(): void {
    this.launcher.close();
  }

  /** A click on the backdrop lands on the dialog itself, never on its content. */
  protected onClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.dismiss();
    }
  }
}
