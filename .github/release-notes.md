Adapta tu hoja de vida a una oferta de empleo con un modelo de IA que se ejecuta
en tu propio equipo. Necesitas al menos un motor: [Ollama](https://ollama.com)
(`ollama pull qwen3.5`), llama.cpp o LM Studio; opcionalmente las CLI `claude` u
`opencode` (agentes en la nube, con permiso explícito).

Más información en [curriculae.inaxis.cc](https://curriculae.inaxis.cc/).

## Descargas

| Sistema | Archivo |
| --- | --- |
| Windows | `Curriculae-*-win-x64.exe` (instalador) o `Curriculae-*-win-portable.exe` |
| macOS (Apple Silicon) | `Curriculae-*-mac-arm64.dmg` |
| macOS (Intel) | `Curriculae-*-mac-x64.dmg` |
| Ubuntu / Debian | `Curriculae-*-linux-amd64.deb` (recomendado) |
| Otras distribuciones Linux | `Curriculae-*-linux-x86_64.AppImage` |

## Primera ejecución

Los ejecutables no están firmados con certificado, así que cada sistema pide
confirmación una vez:

- **Windows**: en el aviso de SmartScreen, *Más información → Ejecutar de todas
  formas*.
- **macOS**: clic derecho sobre la app → *Abrir* → *Abrir*. Si dice que está
  dañada: `xattr -cr /Applications/Curriculae.app`.
- **Linux (.deb)**: `sudo apt install ./Curriculae-*-linux-amd64.deb`.
- **Linux (AppImage)**: `chmod +x Curriculae-*.AppImage`. En Ubuntu 22.04+ hace
  falta `sudo apt install libfuse2t64` (o `libfuse2`), o ejecutarlo con
  `APPIMAGE_EXTRACT_AND_RUN=1`.

Tus hojas de vida y cada versión generada se guardan en `Documentos/Curriculae`.
