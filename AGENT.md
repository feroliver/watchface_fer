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
src/pkjs/index.js          Lado teléfono (JS): baja el calendario iCal y manda eventos al reloj
src/pkjs/calendar.js       Parser iCal (ical.js): evento anterior/próximo respecto de "ahora"
src/pkjs/glucose.js        Cliente LibreLinkUp (login, token, última lectura, SHA-256 propio)
src/pkjs/config.js         Página de configuración (Clay): enlace iCal + cuenta LibreLinkUp
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
- **Arriba derecha — glucosa** (pedido de Fer, reemplazó al pulso): recuadro `G 120 →`
  en mg/dL con flecha de tendencia (↓ ↘ → ↗ ↑). `G ---` si la lectura tiene más de 10 min
  (`GLUCOSE_STALE_S`) o no hay datos. El número y la flecha van coloreados según rangos
  configurables (ver "Colores por rango"). Ver sección "Glucosa".
- **Centro**: hora grande (Russo One 68), sin cero inicial, respeta 12/24 h.
- **Abajo izquierda**: pila dibujada (verde > 40 %, amarilla ≤ 40 %, roja ≤ 20 %) + porcentaje.
- **Abajo derecha — eventos del calendario** (pedido de Fer, reemplazó a amanecer/atardecer):
  - ▲ hora de inicio del **evento anterior**, ▼ hora del **próximo evento**
    (arriba = pasado, abajo = futuro, igual que los botones del Timeline).
  - Si el evento es de hoy muestra la hora (`9:30`); si es de otro día, el día de la semana (`MIÉ`).
  - `--:--` si no hay evento en ±7 días o no hay calendario configurado.

Fuentes (recursos en `package.json`, con `characterRegex` para ahorrar memoria):
`FONT_RUSSO_68` (hora, solo `[0-9:]`), `FONT_RUSSO_26` (glucosa, eventos), `FONT_RUSSO_20`
(fecha, "G", batería). Si se agregan caracteres nuevos al texto (p. ej. otras letras con tilde),
**ampliar el `characterRegex`** o no se dibujan.

### Glucosa (FreeStyle Libre 2 Plus vía LibreLinkUp)
- Fer usa un sensor **FreeStyle Libre 2 Plus** con la app oficial en **Android**. Se eligió
  **LibreLinkUp** (nube de Abbott para "seguidores") para no tocar su app oficial.
  Alternativa descartada por ahora: Juggluco (app local con web server en
  `127.0.0.1:17580/sgv.json`), que reemplaza a la app oficial como lectora del sensor.
- ⚠️ **API no oficial** (misma que usan nightscout-librelink-up y pylibrelinkup). Puede romperse
  si Abbott la cambia: lo primero a probar es subir `LLU_VERSION` en `glucose.js`.
- ⚠️ Valor **orientativo**: no reemplaza la app/lector oficial para decisiones de tratamiento.
- Setup de Fer (una vez): cuenta LibreLinkUp con **otro email** → en la app Libre: Apps
  conectadas → LibreLinkUp → agregar esa cuenta → aceptar la invitación en LibreLinkUp.
  Email/contraseña de la cuenta **seguidora** se cargan en la configuración (Clay) y quedan
  solo en `localStorage` del teléfono. **Nunca commitear credenciales.**
- Flujo (`glucose.js`):
  - `POST https://api.libreview.io/llu/auth/login` con headers `product: llu.android`,
    `version: 4.16.0`. Si responde `redirect` + `region`, repetir en `https://api-<region>.libreview.io`.
    Si responde `step` (`tou`, `pp`, `verifyEmail`), hay que aceptar eso en la app LibreLinkUp.
  - Token (`authTicket`) + `account-id` = SHA-256 hex del `user.id` se guardan en
    `localStorage['llu-auth']` y se reutilizan hasta que vencen o la API los rechaza (re-login 1 vez).
  - `GET /llu/connections` → `data[0].glucoseMeasurement`: `ValueInMgPerDl`, `TrendArrow`
    (1 bajando rápido, 2 bajando, 3 estable, 4 subiendo, 5 subiendo rápido) y
    `FactoryTimestamp` (**UTC**, formato `M/D/YYYY h:mm:ss AM/PM`; se parsea a mano).
- Mensajes: teléfono → reloj `GLUCOSE`, `GLUCOSE_TREND`, `GLUCOSE_TIME` (Unix);
  reloj → teléfono `REQUEST_GLUCOSE` cada 2 min (`GLUCOSE_REFRESH_MIN`). El reloj pide
  glucosa y eventos en **un solo mensaje** y el teléfono envía con una **cola** (no se
  puede mandar un AppMessage mientras otro está en curso).
- Si falla (sin red, credenciales, términos) no se envía nada y el error va a `console.log`
  (`pebble logs`); en el reloj la lectura envejece y pasa a `G ---`.
- **Colores por rango** (pedido de Fer), configurables en Clay, en mg/dL. Por defecto
  rojo < 50 ≤ amarillo < 80 ≤ **verde** ≤ 130 < amarillo ≤ 250 < rojo:
  - Verde: `target_low` ≤ valor ≤ `target_high` (límites incluidos).
  - Amarillo: fuera del objetivo pero `red_low` ≤ valor ≤ `red_high`.
  - Rojo: valor < `red_low` o valor > `red_high`.
  - Se colorean número y flecha; "G", recuadro y `---` quedan blancos.
  - `parseRanges` (en `glucose.js`) valida: vacío/no numérico → defecto, límita a 20–600
    y ordena los 4 valores si el usuario los cargó desordenados.
  - El teléfono los manda (`GLUCOSE_RED_LOW`, `GLUCOSE_TARGET_LOW`, `GLUCOSE_TARGET_HIGH`,
    `GLUCOSE_RED_HIGH`) al abrir la watchface y al guardar la configuración; el reloj los
    guarda con `persist` (colorea aunque no haya teléfono). Defaults también en el C.
- Pendiente de verificar en el teléfono real: que la app Pebble de Android deje hacer las
  requests a libreview.io (y que Cloudflare no las bloquee).

### Eventos del calendario ("Timeline")
- **El SDK no permite leer los pins del Timeline** desde una app (solo crearlos por la web API).
  Por eso se lee directamente el calendario que alimenta al Timeline: Google Calendar vía
  su **"dirección secreta en formato iCal"**.
- Configuración: capability `configurable` + **Clay** (`pebble-clay`). Fer pega el enlace en
  la página de ajustes de la app de Pebble. Clay lo guarda en `localStorage['clay-settings']`
  **solo en el teléfono**; nunca se envía al reloj ni se loguea.
- ⚠️ **El enlace iCal es secreto** (da acceso de lectura al calendario): jamás commitearlo,
  ni en tests ni en ejemplos.
- `calendar.js` usa `ical.js` 1.5.0 (CommonJS; la v2 es ESM y no sirve en pkjs): registra
  `VTIMEZONE`, expande `RRULE`/`EXDATE`, aplica instancias modificadas (`RECURRENCE-ID`),
  ignora eventos de día completo y `STATUS:CANCELLED`. Ventana: ±7 días.
- Mensajes: teléfono → reloj `PREV_EVENT`, `NEXT_EVENT` (inicio en segundos Unix, 0 = no hay);
  reloj → teléfono `REQUEST_EVENTS`. `ICS_URL` existe como messageKey solo para Clay.
- El teléfono actualiza al abrir la watchface, al guardar la configuración y cuando el reloj
  lo pide: cada 30 min (`EVENTS_REFRESH_MIN`) y cuando empieza el próximo evento. En ese
  momento el reloj ya pasa el "próximo" a "anterior" por su cuenta (funciona sin teléfono).
  Los valores se guardan con `persist`.
- Limitación: con un calendario muy largo el `.ics` de Google puede pesar varios MB.
  Si se vuelve lento, evaluar filtrar o cachear.

## Estado actual

- v3: fecha en castellano + glucosa LibreLinkUp (reemplazó al pulso) + eventos del
  calendario (reemplazaron amanecer/atardecer). Tema único blanco sobre negro.
  Capabilities: solo `configurable` (ya no `health` ni `location`).
- Probado en el emulador emery: fecha, tildes, batería y eventos
  end-to-end (calendario de prueba servido en localhost, paso de "próximo" a "anterior").
- Glucosa probada con tests en node (redirect de región, reuso y renovación de token,
  términos pendientes, contraseña mala, SHA-256 contra `crypto`) y en el emulador contra un
  servidor LibreLinkUp simulado (lectura, tendencias, refresco cada 2 min, `G ---`,
  colores en los bordes de cada rango con valores por defecto y personalizados).
- La página de configuración (Clay) no se probó visualmente (en el emulador depende de un
  proxy externo); revisarla en la app de Pebble del teléfono.
- Falta probar en el reloj real con el Google Calendar y la cuenta LibreLinkUp de Fer.
- Ideas pendientes / a decidir con Fer: temas de color, aviso de desconexión Bluetooth,
  pasos, varios calendarios.

## Tips del emulador

- `pebble emu-set-time` **no cambia la fecha** que ve la watchface; para probar fechas,
  hacer un build temporal forzando `s_now` (y volver al código original antes de commitear).
- La watchface redibuja por tick de minuto: tras cambiar algo del emulador, reinstalar
  (`pebble install --emulator emery`) para ver el efecto inmediato.
- Probar la parte de calendario sin la página de ajustes: con el emulador cerrado
  (`pebble kill`), escribir `clay-settings` en el localStorage de pypkjs
  (`~/.local/share/pebble-sdk/4.33.1/emery/localstorage/<uuid>`, formato `dbm.dumb` de Python)
  con `{"ICS_URL": "http://127.0.0.1:8765/cal.ics"}` y servir un `.ics` de prueba con
  `python3 -m http.server 8765`. Usar eventos relativos a la hora actual.
- Probar la glucosa sin la API real: servidor simulado en Python en `127.0.0.1:8766` que
  imite `/llu/auth/login` y `/llu/connections`, y un build **temporal** con
  `LLU_HOST = 'http://127.0.0.1:8766'` en `glucose.js` (restaurarlo antes de commitear).
  Credenciales de prueba en `clay-settings` (`LLU_EMAIL`, `LLU_PASSWORD`) igual que el iCal.
- Tras cambiar `messageKeys` en `package.json` hacer `pebble clean` antes de `pebble build`
  (si no, aparecen errores `MESSAGE_KEY_* undeclared`).

## Git

- Repo **público**: https://github.com/feroliver/watchface_fer (remoto `origin` por SSH, rama `main`).
- Al ser público, no commitear datos privados (enlace iCal, credenciales LibreLinkUp, tokens,
  datos de salud, ubicación, etc.).
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
