import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Curriculae',
    loadComponent: () => import('./pages/home/cv-home').then((m) => m.CvHome),
  },
  { path: '**', redirectTo: '' },
];
