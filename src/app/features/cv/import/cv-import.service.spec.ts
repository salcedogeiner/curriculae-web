import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CvImportService, describeProgress } from './cv-import.service';
import { CvRepository } from '../../../core/storage/cv.repository';

describe('CvImportService', () => {
  let service: CvImportService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(CvImportService);
  });

  it('empieza en idle sin hoja de vida', () => {
    expect(service.status()).toBe('idle');
    expect(service.hasCv()).toBe(false);
    expect(service.issue()).toBeNull();
  });

  it('importa un archivo de texto y lo persiste', async () => {
    await service.import(new File(['# Experiencia\n\nNode 20'], 'cv.md', { type: 'text/markdown' }));

    expect(service.status()).toBe('ready');
    expect(service.hasCv()).toBe(true);
    expect(service.fileName()).toBe('cv.md');
    expect(service.format()).toBe('markdown');
    expect(TestBed.inject(CvRepository).read()?.text).toContain('Node 20');
  });

  it('expone un error con su clave de traducción y sus parámetros', async () => {
    await service.import(new File(['x'], 'cv.rtf', { type: 'application/rtf' }));

    const issue = service.issue();
    expect(service.status()).toBe('error');
    expect(issue?.messageKey).toBe('cv.errors.unsupportedFormat');
    expect(issue?.params['fileName']).toBe('cv.rtf');
  });

  it('usa un mensaje propio para el .doc antiguo', async () => {
    await service.import(new File(['x'], 'cv.doc', { type: 'application/msword' }));

    expect(service.issue()?.messageKey).toBe('cv.errors.oldWordFormat');
  });

  it('conserva la hoja de vida anterior si el archivo nuevo falla', async () => {
    await service.import(new File(['original'], 'cv.txt', { type: 'text/plain' }));
    await service.import(new File(['x'], 'cv.rtf', { type: 'application/rtf' }));

    expect(service.status()).toBe('error');
    expect(service.hasCv()).toBe(true);
    expect(service.fileName()).toBe('cv.txt');
  });

  it('restaura la hoja de vida de la sesión anterior', async () => {
    await service.import(new File(['guardado'], 'cv.txt', { type: 'text/plain' }));

    const restored = TestBed.inject(CvImportService);
    restored.restore();

    expect(restored.fileName()).toBe('cv.txt');
    expect(restored.cv()?.text).toBe('guardado');
  });

  it('restaura en vacío sin lanzar cuando no hay nada guardado', () => {
    expect(() => service.restore()).not.toThrow();
    expect(service.hasCv()).toBe(false);
  });

  it('descarta un payload corrupto o de otra versión sin lanzar', () => {
    localStorage.setItem('curriculae:cv', 'no es json');
    expect(service.restore()).toBeUndefined();
    expect(service.hasCv()).toBe(false);

    localStorage.setItem('curriculae:cv', JSON.stringify({ schemaVersion: 99, text: 'x' }));
    service.restore();
    expect(service.hasCv()).toBe(false);
  });

  it('olvida la hoja de vida y borra el almacenamiento', async () => {
    await service.import(new File(['x'], 'cv.txt', { type: 'text/plain' }));

    service.forget();

    expect(service.hasCv()).toBe(false);
    expect(service.status()).toBe('idle');
    expect(TestBed.inject(CvRepository).read()).toBeNull();
  });
});

describe('describeProgress', () => {
  it('solo muestra el contador cuando el PDF tiene más de una página', () => {
    expect(describeProgress('cv.pdf', { done: 1, total: 1 })).toBe('cv.pdf');
    expect(describeProgress('cv.pdf', { done: 2, total: 5 })).toBe('cv.pdf · 2/5');
    expect(describeProgress(null, { done: 2, total: 5 })).toBeNull();
  });
});
