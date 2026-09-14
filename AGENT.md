# AGENT.md — watchface_fer

Watchface personal para **Pebble Time 2**, escrito en **C** con el SDK de Pebble.
Este archivo reúne lo relevante del proyecto para quien trabaje en él (humano o agente).
Mantenerlo actualizado cuando cambien decisiones, diseño o comandos.

## Hardware objetivo

| Dato            | Valor                                   |
|-----------------|-----------------------------------------|
| Reloj           | Pebble Time 2 (Core Devices)            |
| Plataforma SDK  | `emery`                                 |
| Pantalla        | 200 × 228 px, rectangular, color (64 colores), ~202 PPI |
| Entrada         | 4 botones, pantalla táctil (no usada por ahora) |

- `targetPlatforms` en `package.json` tiene **solo `emery`**. Si en algún momento se
  quiere soportar otros relojes (gabbro = Round 2, flint = Pebble 2 Duo, basalt…),
  agregarlos ahí y evitar coordenadas fijas (usar `layer_get_bounds`).
- Las apps que no están compiladas para emery se ven en "bezel mode" (144×168 centrado),
  por eso compilamos nativo para emery.

## Entorno de desarrollo (Linux)

Ya está instalado en esta máquina:

- `uv` → `~/.local/bin/uv`
- `pebble-tool` v5.0.40 (instalado con `uv tool install pebble-tool`) → `~/.local/bin/pebble`
- SDK activo: **4.33.1** en `~/.local/share/pebble-sdk/SDKs/4.33.1/`
  - Headers: `.../sdk-core/pebble/emery/include/pebble.h`
- Dependencias del emulador (SDL2, glib, pixman, sndio): ya presentes en el sistema.

Reinstalación desde cero: `curl -LsSf https://astral.sh/uv/install.sh | sh`,
`uv tool install pebble-tool`, `pebble sdk install latest`.

## Comandos

```sh
pebble build                                  # compila -> build/watchface_fer.pbw
pebble install --emulator emery               # instala y abre en el emulador del Time 2
pebble screenshot --emulator emery --no-open out.png   # captura del emulador
pebble logs --emulator emery                  # ver APP_LOG
pebble emu-set-time 10:08 --emulator emery    # fijar hora (útil para capturas)
pebble emu-battery --percent 20 --emulator emery
pebble emu-bt-connection --connected no --emulator emery
pebble kill                                   # cerrar el emulador

# En el reloj real (app Pebble en el teléfono con "Dev Connect" activado):
pebble login
pebble install --cloudpebble
# o por IP del teléfono en la misma red:
pebble install --phone <ip>
```

Verificación mínima después de cada cambio: `pebble build` sin errores y captura
del emulador emery para revisar el layout.

## Estructura del proyecto

```
package.json          Metadatos: UUID, nombre, plataformas, recursos, messageKeys
wscript               Reglas de build (waf) — normalmente no se toca
src/c/watchface_fer.c Código del watchface
resources/            (a crear) fuentes, imágenes
src/pkjs/             (a crear) JS del lado del teléfono, si hace falta clima/config
```

Datos fijos de `package.json`:
- `uuid`: `611e739a-8f35-471b-8aed-4b493e3ecb9e` — **no cambiarlo**, identifica la app
  en el reloj (cambiarlo instala una app distinta).
- `watchapp.watchface: true`.

## Estado actual

- Esqueleto funcional: fondo negro, hora (`FONT_KEY_LECO_42_NUMBERS`, respeta 12/24 h)
  y fecha abajo (`%a %d %b`), actualización cada minuto con `tick_timer_service`.
- Probado en el emulador emery (compila y se ve bien).
- **Pendiente: definir el diseño propio de Fer** (el esqueleto es un placeholder).

## Git

- Repo **público**: https://github.com/feroliver/watchface_fer (remoto `origin` por SSH, rama `main`).
- Al ser público, no commitear datos privados (tokens, API keys de clima, ubicación, etc.).
- `build/`, `*.pbw` y `.lock-waf*` están en `.gitignore`, porque se generan al compilar.
- Mensajes de commit en español.

## Convenciones y notas técnicas

- Idioma del código: C99 al estilo de los ejemplos del SDK (`s_` para estáticos de módulo,
  handlers `*_handler`, `window_load`/`window_unload` crean/destruyen layers).
- Todo lo que se crea con `*_create` se destruye en `window_unload`/`deinit`.
- Batería: suscribirse a `MINUTE_UNIT` salvo que haga falta segundero; evitar
  `SECOND_UNIT` y timers frecuentes. Pedir datos al teléfono con moderación.
- Buffers de texto de `TextLayer` deben ser `static` (el layer guarda el puntero).
- Colores: usar `GColor*` y `PBL_IF_COLOR_ELSE` si se agregan plataformas B/N.
- Localización de la fecha: `strftime` usa el locale del reloj; los nombres en español
  pueden requerir tablas propias si el firmware no los da.

## Documentación

- SDK y guías: https://developer.repebble.com
- Tutorial watchface en C: https://developer.repebble.com/tutorials/watchface-tutorial/part1/
- Anuncio de la plataforma Emery: https://developer.rebble.io/blog/2016/10/11/Emery-SDK-Beta/
