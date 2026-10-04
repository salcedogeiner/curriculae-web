import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18n } from './core/i18n/i18n';
import { LauncherDrawer } from './features/launcher/launcher-drawer/launcher-drawer';
import { LauncherService } from './features/launcher/launcher.service';
import { StartScreen } from './features/launcher/start-screen/start-screen';

/**
 * The shell. In the desktop app it opens on the start screen (the launcher),
 * and the routed home page is only created once the user leaves it; from
 * then on the menu button in the header slides the launcher back in over the
 * page. In the browser there is no launcher: header and page, nothing else.
 */
@Component({
  imports: [RouterOutlet, StartScreen, LauncherDrawer],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly i18n = inject(I18n);
  protected readonly launcher = inject(LauncherService);

  private readonly main = viewChild<ElementRef<HTMLElement>>('main');

  constructor() {
    // Leaving the start screen removes the button that had focus. Put it on
    // the page instead of letting it fall to <body>; a version picked there
    // moves it on to its own heading once the page has loaded.
    let leftStart = !this.launcher.startup();
    effect(() => {
      const main = this.main()?.nativeElement;
      if (main === undefined || leftStart) {
        return;
      }
      leftStart = true;
      untracked(() => main.focus({ preventScroll: true }));
    });
  }
}
