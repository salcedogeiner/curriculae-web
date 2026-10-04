import { Injectable, computed, inject, signal } from '@angular/core';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { GenerationService } from '../generation/generation.service';
import { VacancyService } from '../vacancy/vacancy.service';

/**
 * - `start`  the desktop app just opened: the start screen replaces the home page.
 * - `drawer` the same choices, slid in over the home page from the menu.
 * - `closed` the home page alone.
 */
export type LauncherView = 'start' | 'drawer' | 'closed';

/**
 * Desktop only: the launcher is where a session starts — a new space, the
 * workspace folder, the versions generated before — and where the menu
 * brings the user back without losing what is on the home page.
 *
 * In the browser there is no workspace, so the view starts `closed` and
 * stays there: the home page is the whole app.
 */
@Injectable({ providedIn: 'root' })
export class LauncherService {
  private readonly workspace = inject(WorkspaceService);
  private readonly vacancy = inject(VacancyService);
  private readonly generation = inject(GenerationService);

  readonly available = this.workspace.available;

  private readonly _view = signal<LauncherView>(this.available ? 'start' : 'closed');

  readonly view = this._view.asReadonly();
  readonly startup = computed(() => this._view() === 'start');
  readonly drawerOpen = computed(() => this._view() === 'drawer');

  /** There is unfinished work to go back to: the vacancy draft survives a restart. */
  readonly canResume = computed(
    () => this.vacancy.charCount() > 0 || this.generation.result() !== null,
  );

  /** A new space would throw away a generation still running. */
  readonly canStartNew = computed(() => !this.generation.busy());

  openDrawer(): void {
    if (this._view() === 'closed' && this.available) {
      this._view.set('drawer');
    }
  }

  close(): void {
    this._view.set('closed');
  }

  /**
   * A clean slate for a new vacancy: the draft and the result on screen go,
   * the base CV stays (it is reused across vacancies, AGENTS.md §4). Does not
   * close the launcher; the host does, so a modal can close synchronously.
   */
  startNew(): boolean {
    if (!this.generation.reset()) {
      return false;
    }
    this.vacancy.clear();
    return true;
  }
}
