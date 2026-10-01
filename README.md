# Curriculae

Adapta tu hoja de vida a una oferta de empleo con un modelo de IA que se ejecuta
en tu propio equipo. Sin servidor, sin cuenta, sin telemetría.

1. **Carga tu hoja de vida** (PDF, DOCX, Markdown o TXT).
2. **Pega la oferta**, elige el modelo (detectado en tu equipo) y pulsa
   **Generar nueva versión de la hoja de vida**.
3. **Revisa el resultado**: compatibilidad, brechas, la hoja de vida adaptada con
   los datos no verificados marcados, y expórtala a PDF, Word o Markdown.

La versión adaptada nunca debe inventar: la app compara cada nombre, tecnología,
cifra y palabra tomada de la oferta con tu hoja de vida original y marca lo que
no encuentra antes de que lo envíes.

## Requisitos

- Node 24.21 y npm 11.19.
- Al menos un motor de IA:
  - **Local** (recomendado, tu hoja de vida no sale del equipo):
    [Ollama](https://ollama.com) (`ollama pull qwen3.5`), llama.cpp (`:8080`) o
    LM Studio (`:1234`).
  - **Agente** (puede enviar tus datos a la nube; la app pide permiso explícito):
    la CLI de `claude` u `opencode`. Solo en la app de escritorio.

## App de escritorio (Electron)

```bash
npm install
npm run desktop        # build de producción + ventana de escritorio
npm run desktop:dev    # ng serve + Electron con recarga en vivo
```

La app de escritorio detecta los motores locales y los agentes CLI instalados,
y mantiene una carpeta de trabajo (por defecto `~/Documentos/Curriculae`,
configurable desde la propia app):

```
Curriculae/
  hojas-de-vida/                     cada hoja de vida que cargas, tal cual
  ofertas/
    2026-10-01_0930-puesto-empresa/  una carpeta por versión generada
      oferta.txt                     la oferta que pegaste
      hoja-de-vida-adaptada.md       la hoja de vida generada
      analisis.json                  compatibilidad, requisitos, modelo usado
      *.pdf / *.docx / *.md          lo que exportes
```

**Linux (Ubuntu 23.10+):** si el sistema restringe los *user namespaces*, el
sandbox de Chromium necesita un ajuste de una sola vez; mientras tanto el
lanzador arranca con `--no-sandbox` y te muestra el comando:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

## Ejecutables y releases

```bash
npm run dist           # empaqueta para el sistema actual en release/
```

Los ejecutables de Windows, macOS y Linux se publican solos: al empujar un tag
`vX.Y.Z`, el workflow `.github/workflows/release.yml` pasa el gate de calidad,
construye en un runner de cada sistema (macOS solo puede construirse en macOS)
y crea el release con los instaladores y las notas de
`.github/release-notes.md`.

```bash
npm version 0.2.0 --no-git-tag-version   # sube la versión en package.json
git commit -am "chore: release 0.2.0" && git tag v0.2.0 && git push --follow-tags
```

## En el navegador

```bash
npm start              # http://localhost:4200
```

Solo detecta motores locales, y Ollama tiene que aceptar el origen:
`OLLAMA_ORIGINS=http://localhost:4200 ollama serve`. Las exportaciones se
descargan en lugar de guardarse en la carpeta de trabajo.

## Desarrollo

```bash
npm run build && npm test          # app Angular (Vitest + jsdom)
npm run test:desktop               # proceso principal de Electron (Vitest, Node)
npm run typecheck:desktop          # tipos del JS de Electron contra desktop-api.ts
```

Las reglas del proyecto están en [AGENTS.md](AGENTS.md).
