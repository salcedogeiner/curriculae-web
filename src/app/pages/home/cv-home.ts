import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n';
import { CvImportService } from '../../features/cv/import/cv-import.service';
import { CvDropzone } from '../../features/cv/dropzone/cv-dropzone';
import { CvPreview } from '../../features/cv/preview/cv-preview';

/**
 * Home / step 1: load the base CV.
 *
 * A page is the composition and routing layer; the pieces it assembles live in
 * `features/cv`. This one stacks intro → preview of the loaded CV → drop zone →
 * loaded file summary, and the drop zone absorbs whatever height is left so it
 * covers the whole half. The second column is intentionally empty for now — the
 * vacancy and the analysis land there in the next steps of the pipeline.
 */
@Component({
  selector: 'app-cv-home',
  imports: [CvDropzone, CvPreview],
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
