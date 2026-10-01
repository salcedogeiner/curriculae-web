import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { CvImportService } from '../../features/cv/import/cv-import.service';
import { CvDropzone } from '../../features/cv/dropzone/cv-dropzone';
import { CvPreview } from '../../features/cv/preview/cv-preview';
import { GenerationForm } from '../../features/generation/generation-form/generation-form';
import { GenerationResult } from '../../features/generation/generation-result/generation-result';
import { GenerationHistory } from '../../features/history/generation-history';

/**
 * Home: the whole flow on one page.
 *
 * A page is the composition and routing layer; the pieces it assembles live in
 * `features/*`. The first screen holds the two inputs side by side — the base
 * CV on the left (intro → preview → drop zone, the zone absorbing the height
 * left over), and on the right the vacancy, the model and the button that
 * generates a new version. The result appears below them once there is one,
 * and in the desktop app the workspace folder and the history close the page.
 */
@Component({
  selector: 'app-cv-home',
  imports: [CvDropzone, CvPreview, GenerationForm, GenerationResult, GenerationHistory],
  templateUrl: './cv-home.html',
  styleUrl: './cv-home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvHome {
  protected readonly i18n = inject(I18n);
  private readonly cvImport = inject(CvImportService);

  protected readonly cv = this.cvImport.cv;

  constructor() {
    this.cvImport.restore();
  }
}
