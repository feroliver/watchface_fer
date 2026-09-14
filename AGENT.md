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
package.json               Metadatos: UUID, nombre, plataformas, capabilities, fuentes, messageKeys
wscript                    Reglas de build (waf) — normalmente no se toca
src/c/watchface_fer.c      Watchface (C): dibujo y datos del reloj
src/pkjs/index.js          Lado teléfono (JS): ubicación + cálculo de amanecer/atardecer
resources/fonts/           Russo One (RussoOne-Regular.ttf) + su licencia OFL.txt
```

Datos fijos de `package.json`:
- `uuid`: `611e739a-8f35-471b-8aed-4b493e3ecb9e` — **no cambiarlo**, identifica la app
  en el reloj (cambiarlo instala una app distinta).
- `watchapp.watchface: true`.

## Diseño

Basado en la watchface **Typical Outdoor** (rukari / @hidea, emery):
https://apps.repebble.com/typical-outdoor_246967574a054baa90f691bf ·
código: https://github.com/hidea/typical-outdoor-watchface

⚠️ Ese repo **no tiene licencia** (todos los derechos reservados): se toma la idea
visual como referencia, pero **no se copia su código**. Todo el código de este repo es propio.

Layout (200×228), todo dibujado en un único `Layer` (`canvas_update_proc`), una función por zona:
- Marco redondeado blanco alrededor de la pantalla.
- **Arriba izquierda — fecha en castellano** (pedido de Fer):
  - Línea 1: `DD/MES` con día de 2 dígitos y mes en 3 letras mayúsculas → `24/ENE`, `02/JUN`.
  - Línea 2: día de la semana en 3 letras → `DOM LUN MAR MIÉ JUE VIE SÁB` (con tilde).
  - Se arma con tablas propias `MONTHS`/`WEEKDAYS`, no con `strftime` (que da inglés).
- **Arriba derecha**: recuadro con corazón + pulso (Pebble Health, `--` si no hay dato).
- **Centro**: hora grande (Russo One 68), sin cero inicial, respeta 12/24 h.
- **Abajo izquierda**: pila dibujada (verde > 40 %, amarilla ≤ 40 %, roja ≤ 20 %) + porcentaje.
- **Abajo derecha**: ▲ amanecer / ▼ atardecer.

Fuentes (recursos en `package.json`, con `characterRegex` para ahorrar memoria):
`FONT_RUSSO_68` (hora, solo `[0-9:]`), `FONT_RUSSO_26` (pulso, sol), `FONT_RUSSO_20`
(fecha, batería). Si se agregan caracteres nuevos al texto (p. ej. otras letras con tilde),
**ampliar el `characterRegex`** o no se dibujan.

### Amanecer / atardecer
- `src/pkjs/index.js` pide la ubicación al teléfono (`capabilities: location`) y calcula
  con la "sunrise equation" (días julianos). Verificado contra valores publicados
  (Buenos Aires, Ushuaia) con error ≤ 1–2 min; devuelve -1 en día/noche polar.
- Envía `SUNRISE`/`SUNSET` (minutos desde medianoche local) al abrir la watchface;
  el reloj pide recálculo con `REQUEST_SUN` al cambiar el día. Se guardan con `persist`.

## Estado actual

- v1 funcional con el diseño de arriba, tema único blanco sobre negro. Probado en el
  emulador emery (fecha, tildes, pulso con `emu-heart-rate`, niveles de batería).
- Ideas pendientes / a decidir con Fer: temas de color, configuración desde el teléfono,
  aviso de desconexión Bluetooth, pasos.

## Tips del emulador

- `pebble emu-set-time` **no cambia la fecha** que ve la watchface; para probar fechas,
  hacer un build temporal forzando `s_now` (y volver al código original antes de commitear).
- La watchface redibuja por tick de minuto: tras cambiar algo del emulador, reinstalar
  (`pebble install --emulator emery`) para ver el efecto inmediato.
- Tras cambiar `messageKeys` en `package.json` hacer `pebble clean` antes de `pebble build`
  (si no, aparecen errores `MESSAGE_KEY_* undeclared`).

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
- Textos visibles en castellano. Identificadores en inglés, comentarios en castellano.

## Documentación

- SDK y guías: https://developer.repebble.com
- Tutorial watchface en C: https://developer.repebble.com/tutorials/watchface-tutorial/part1/
- Anuncio de la plataforma Emery: https://developer.rebble.io/blog/2016/10/11/Emery-SDK-Beta/
