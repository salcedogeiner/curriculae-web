import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { GenerationHistory } from '../../history/generation-history';
import { LauncherService } from '../launcher.service';

/**
 * The launcher's content, shared by the start screen and the side panel: the
 * actions that leave for the home page, then the workspace folder and the
 * versions generated before (`GenerationHistory`).
 *
 * It never closes anything itself: it emits `leave` and the host decides how,
 * because the side panel has to close its `<dialog>` synchronously, before the
 * home page moves focus to whatever was picked.
 */
@Component({
  selector: 'app-launcher-panel',
  imports: [GenerationHistory],
  templateUrl: './launcher-panel.html',
  styleUrl: './launcher-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LauncherPanel {
  protected readonly i18n = inject(I18n);
  protected readonly launcher = inject(LauncherService);

  /** Offer "Continuar donde lo dejaste" (start screen; the panel has its own back button). */
  readonly offerResume = input(false);

  readonly leave = output<void>();

  protected startNew(): void {
    if (this.launcher.startNew()) {
      this.leave.emit();
    }
  }
}
