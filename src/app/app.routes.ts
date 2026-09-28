import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Curriculae',
    loadComponent: () => import('./features/cv/cv-home').then((m) => m.CvHome),
  },
  { path: '**', redirectTo: '' },
];
