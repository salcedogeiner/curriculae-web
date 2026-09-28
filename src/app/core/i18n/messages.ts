/**
 * Spanish message catalogue — the single place user-facing copy lives (AGENTS.md §7).
 * Keys are dotted paths; the types below keep `t()` honest, so a typo in a template
 * is a compile error rather than a raw key rendered on screen.
 */
export const es = {
  app: {
    title: 'Curriculae',
    tagline: 'Adapta tu hoja de vida a una vacante sin que salga de tu equipo.',
    skipToContent: 'Saltar al contenido principal',
  },
  cv: {
    stepTitle: '1 · Tu hoja de vida',
    stepLead:
      'Suelta aquí tu archivo o selecciónalo. Se procesa en este navegador: el texto nunca se envía a ningún servidor.',
    preview: {
      title: 'Vista previa del contenido',
      meta: '{chars} caracteres extraídos de {fileName}',
      bodyLabel: 'Texto extraído de la hoja de vida',
    },
    dropzone: {
      legend: 'Cargar la hoja de vida base',
      title: 'Arrastra tu hoja de vida aquí',
      or: 'o',
      action: 'Selecciona el archivo',
      formats: 'Formatos admitidos: {formats}. Máximo {maxSize}.',
      dragActive: 'Suelta el archivo para cargarlo',
      reading: 'Leyendo {fileName}…',
      loaded: 'Hoja de vida cargada: {fileName} · {chars} caracteres · {format}',
      change: 'Cargar otro archivo',
    },
    errors: {
      unsupportedFormat: '“{fileName}” no es un formato admitido.',
      tooLarge: '“{fileName}” pesa {size} y el máximo es {maxSize}.',
      emptyFile: '“{fileName}” no tiene texto legible.',
      scannedPdf:
        '“{fileName}” parece un PDF escaneado: no tiene capa de texto. Carga un PDF con texto seleccionable o pega el contenido.',
      corruptFile: 'No se pudo leer “{fileName}”: el archivo puede estar dañado o protegido con contraseña.',
      pdfUnsupported:
        'Este navegador no permite procesar archivos PDF. Guarda tu hoja de vida como .docx o .md y vuelve a intentarlo.',
      readFailed: 'No se pudo leer “{fileName}”. Vuelve a intentarlo.',
      oldWordFormat: 'El formato .doc de Word 97-2003 no está admitido. Guarda el archivo como .docx.',
    },
  },
} as const;

/** `app.title` | `cv.dropzone.legend` | … */
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof es>;
export type MessageParams = Readonly<Record<string, string | number>>;

export type Catalogue = typeof es;
