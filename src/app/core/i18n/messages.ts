/**
 * Spanish message catalogue — the single place user-facing copy lives (AGENTS.md §7).
 * Keys are dotted paths; the types below keep `t()` honest, so a typo in a template
 * is a compile error rather than a raw key rendered on screen.
 */
export const es = {
  app: {
    title: 'Curriculae',
    tagline: 'Adapta tu hoja de vida a una vacante obteniendo una versión adaptada y analizada.',
    skipToContent: 'Saltar al contenido principal',
    stepLabel: 'Paso {n}: ',
    menu: 'Inicio',
    menuLabel: 'Abrir el inicio: espacio nuevo, carpeta de trabajo e historial',
  },
  launcher: {
    welcome: 'Elige cómo quieres empezar.',
    newSpace: 'Crear nuevo espacio',
    newSpaceHint: 'Empieza con una vacante nueva. Tu hoja de vida base se conserva.',
    newSpaceBusy: 'Espera a que termine la generación en curso o cancélala.',
    resume: 'Continuar donde lo dejaste',
    resumeHint: 'Vuelve a la vacante y la versión con las que estabas trabajando.',
    drawerTitle: 'Inicio',
    drawerLead: 'Empieza con otra vacante o retoma una versión anterior.',
    back: 'Volver a mi espacio de trabajo',
  },
  cv: {
    stepTitle: 'Tu hoja de vida',
    stepLead:
      'Suelta aquí tu archivo o selecciónalo. Se procesa en tu equipo: el texto nunca se envía a ningún servidor.',
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
      corruptFile:
        'No se pudo leer “{fileName}”: el archivo puede estar dañado o protegido con contraseña.',
      pdfUnsupported:
        'Este navegador no permite procesar archivos PDF. Guarda tu hoja de vida como .docx o .md y vuelve a intentarlo.',
      readFailed: 'No se pudo leer “{fileName}”. Vuelve a intentarlo.',
      oldWordFormat:
        'El formato .doc de Word 97-2003 no está admitido. Guarda el archivo como .docx.',
    },
  },
  vacancy: {
    stepTitle: 'La oferta de empleo',
    stepLead:
      'Pega el texto completo de la oferta, elige el modelo y genera una versión de tu hoja de vida adaptada a ella.',
    label: 'Texto de la oferta',
    placeholder: 'Pega aquí la descripción completa: funciones, requisitos, empresa…',
    charCount: '{chars} de {max} caracteres',
    clear: 'Borrar el texto',
    errors: {
      tooShort: 'La oferta es demasiado corta: pega al menos {min} caracteres.',
      tooLong: 'La oferta supera el máximo de {max} caracteres.',
    },
  },
  settings: {
    model: {
      label: 'Modelo de IA',
      hint: 'Detectado en tu equipo. Los modelos locales no envían nada fuera de él.',
      placeholder: '— Selecciona un modelo —',
      group: '{engine} · {tier}',
      detecting: 'Buscando motores de IA en tu equipo…',
      refresh: 'Volver a detectar',
      tierLocal: 'local',
      tierAgent: 'agente en la nube',
      badgeLocal: 'Privado',
      badgeLocalTitle: 'Se ejecuta en tu equipo: tu hoja de vida no sale de él.',
      badgeAgent: 'Nube',
      badgeAgentTitle: 'Este motor puede enviar tu hoja de vida a un proveedor externo.',
      noEngine: 'No se encontró ningún motor de IA en tu equipo.',
      setupHint: 'Instala Ollama desde ollama.com y descarga un modelo con:',
      setupCommand: 'ollama pull qwen3.5',
      blockedHint:
        '{engine} responde, pero el navegador bloqueó la conexión (CORS). Reinícialo con:',
      blockedCommand: 'OLLAMA_ORIGINS=http://localhost:4200 ollama serve',
      browserOnly:
        'En el navegador solo se detectan motores locales. Abre la app de escritorio para usar también los agentes (Claude, opencode).',
    },
    engines: {
      summary: 'Motores revisados ({count})',
      ready: '{count} modelos',
      readyOne: '1 modelo',
      noModels: 'sin modelos',
      unavailable: 'no encontrado',
      blocked: 'bloqueado por CORS',
    },
    consent: {
      title: 'Este motor puede usar la nube',
      text: 'Con {engine}, tu hoja de vida y la oferta pueden enviarse a un proveedor externo, según cómo lo tengas configurado.',
      accept: 'Acepto enviar mis datos a este motor',
      revokeHint: 'Puedes retirar el permiso cuando quieras desmarcando la casilla.',
    },
  },
  generation: {
    submit: 'Generar nueva versión de la hoja de vida',
    cancel: 'Cancelar',
    needsCv: 'Primero carga tu hoja de vida en el paso 1.',
    needsVacancy: 'Pega el texto de la oferta.',
    needsModel: 'Selecciona un modelo de IA.',
    needsConsent: 'Acepta el uso de la nube o elige un modelo local.',
    slowHint:
      'Un modelo local puede tardar uno o varios minutos. Puedes cancelar en cualquier momento.',
    phase: {
      analysing: 'Paso 1 de 2 · Analizando la oferta frente a tu hoja de vida…',
      adapting: 'Paso 2 de 2 · Redactando la hoja de vida adaptada…',
      saving: 'Guardando en tu carpeta de trabajo…',
      thinking: 'El modelo está razonando…',
      received: '{chars} caracteres recibidos',
      done: 'Nueva versión lista.',
    },
    errors: {
      aborted: 'Generación cancelada.',
      timeout:
        'El modelo tardó demasiado en responder. Prueba con un modelo más pequeño o una oferta más corta.',
      unreachable:
        'No se pudo conectar con el motor. Comprueba que sigue en ejecución y vuelve a detectar.',
      blocked: 'El navegador bloqueó la conexión con el motor (CORS).',
      http: 'El motor rechazó la petición. Comprueba que el modelo sigue instalado.',
      engineFailed: 'El motor falló al generar la respuesta.',
      emptyResponse: 'El modelo no devolvió ningún texto.',
      malformedJson:
        'El modelo devolvió algo inesperado en el análisis. Reinténtalo o elige otro modelo.',
      consentRequired: 'Este motor necesita tu permiso para usar la nube.',
      unknown: 'Algo salió mal durante la generación.',
    },
    retry: 'Reintentar',
    dismiss: 'Cerrar aviso',
  },
  result: {
    title: 'Resultado',
    meta: 'Generada el {date} con {model}',
    baseCv: 'A partir de {fileName}',
    vacancy: 'Ver el texto de la oferta',
    draftTitle: 'Vista previa en vivo',
  },
  analysis: {
    title: 'Análisis de compatibilidad',
    score: 'Compatibilidad',
    scoreValue: '{score} %',
    scoreMeterLabel: 'Compatibilidad con la oferta',
    requirements: 'Requisitos de la oferta',
    evidence: 'En tu hoja de vida: “{quote}”',
    gaps: 'Lo que la oferta pide y tu hoja de vida no muestra',
    noGaps: 'No se detectaron requisitos sin respaldo.',
    strengths: 'Tus fortalezas para esta oferta',
    verdict: {
      match: 'Cumple',
      partial: 'Parcial',
      missing: 'No aparece',
      unverifiable: 'No verificable',
    },
    importance: {
      must: 'Obligatorio',
      nice: 'Deseable',
      plus: 'Extra',
    },
  },
  adapted: {
    title: 'Hoja de vida adaptada',
    bodyLabel: 'Contenido de la hoja de vida adaptada',
    unverifiedTitle: 'Revisa estos datos antes de enviarla',
    unverifiedLead:
      'No aparecen en tu hoja de vida original. Puede ser una reformulación, o algo inventado por el modelo: verifícalos.',
    allVerified: 'Todos los nombres, tecnologías y cifras aparecen en tu hoja de vida original.',
    flagged: 'no verificado',
  },
  export: {
    title: 'Exportar',
    pdf: 'PDF',
    docx: 'Word (DOCX)',
    markdown: 'Markdown',
    copy: 'Copiar texto',
    copied: 'Texto copiado al portapapeles.',
    saved: 'Guardado: {fileName}',
    downloaded: 'Descargado: {fileName}',
    failed: 'No se pudo exportar el archivo.',
    copyFailed: 'No se pudo copiar al portapapeles.',
    working: 'Exportando…',
  },
  history: {
    title: 'Hojas de vida generadas',
    empty: 'Todavía no has generado ninguna. Cada versión se guarda en su propia carpeta.',
    untitled: 'Oferta sin título',
    show: 'Ver',
    showLabel: 'Ver la versión para {title}',
    openFolder: 'Abrir carpeta',
    openFolderLabel: 'Abrir la carpeta de {title}',
    score: '{score} %',
    scoreLabel: 'compatibilidad',
    showMore: 'Ver {count} más',
    showLess: 'Ver menos',
    current: 'En pantalla',
  },
  workspace: {
    title: 'Carpeta de trabajo',
    lead: 'Tus hojas de vida y cada versión generada se guardan en esta carpeta de tu equipo.',
    location: 'Ubicación actual',
    cvs: 'Hojas de vida cargadas',
    offers: 'Versiones por oferta',
    open: 'Abrir',
    openLabel: 'Abrir la carpeta {name}',
    openRoot: 'Abrir carpeta',
    change: 'Cambiar ubicación',
    errors: {
      saveCv: 'No se pudo guardar la hoja de vida en la carpeta de trabajo.',
      saveGeneration: 'La versión se generó, pero no se pudo guardar en la carpeta de trabajo.',
      list: 'No se pudo leer la carpeta de trabajo.',
      read: 'No se pudo abrir esa versión: puede que la carpeta se haya movido o borrado.',
      export: 'No se pudo guardar el archivo exportado.',
      open: 'No se pudo abrir la carpeta.',
    },
  },
} as const;

/** `app.title` | `cv.dropzone.legend` | … */
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof es>;
export type MessageParams = Readonly<Record<string, string | number>>;

export type Catalogue = typeof es;
