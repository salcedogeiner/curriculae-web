import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n';
import { LauncherPanel } from '../launcher-panel/launcher-panel';
import { LauncherService } from '../launcher.service';

/**
 * Desktop only: the first thing the app shows, before the home page is even
 * loaded. Leaving it — a new space, "continuar", or a past version — closes
 * the launcher for good; the menu brings the same content back as a panel.
 */
@Component({
  selector: 'app-start-screen',
  imports: [LauncherPanel],
  templateUrl: './start-screen.html',
  styleUrl: './start-screen.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StartScreen {
  protected readonly i18n = inject(I18n);
  protected readonly launcher = inject(LauncherService);
}
