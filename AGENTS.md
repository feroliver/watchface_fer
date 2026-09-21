# AGENTS.md — watchface_fer

Watchface para Pebble Time 2 (plataforma `emery`, 200×228, color) en C + PebbleKit JS.
Muestra fecha en castellano, hora, glucosa (LibreLinkUp), batería, eventos de Google Calendar
y una torta junto al día cuando hay un cumpleaños.
La documentación para humanos (qué hace, historia, decisiones, setup) está en la nota de
Obsidian del dueño: `/home/fer/Obsidian/fer_brain/Pebble/watchface_fer.md`.

## Comandos

```sh
pebble build                                   # tras cambiar messageKeys: pebble clean antes
pebble install --emulator emery                # emulador; reinstalar para ver cambios ya
pebble screenshot --emulator emery --no-open out.png
pebble build && pebble install --cloudpebble   # reloj real vía Dev Connect
pebble logs --cloudpebble                      # console.log del teléfono + APP_LOG del reloj
node <test>.js                                 # la lógica de src/pkjs se prueba con node
```

Entorno: `pebble-tool` (instalado con `uv tool install pebble-tool`), SDK 4.33.1.

## Reglas

- **Después de cada cambio** en el watchface (código, diseño, config, decisiones, bugs, estado),
  actualizar la nota de Obsidian: `updated:` del YAML, secciones afectadas y fila en
  "Historial de commits". Actualizar, no reestructurar. Si cambian reglas o restricciones,
  actualizar también este archivo.
- **No cambiar el `uuid`** de `package.json`: identifica la app en el reloj.
- **Nunca commitear secretos** ni ponerlos en tests, ejemplos o logs: enlace iCal secreto,
  credenciales o tokens de LibreLinkUp. El repo es público.
- **No copiar código de "Typical Outdoor"** (hidea/typical-outdoor-watchface): el diseño se
  inspira en él, pero su repo no tiene licencia. La fuente Russo One es OFL (incluida, ok).
- Verificar cada cambio: `pebble build` sin warnings + captura del emulador. Cambios en
  `src/pkjs`: probar la lógica con node.
- Builds temporales para pruebas (host simulado, fecha forzada) se revierten antes de commitear.
- Castellano: textos visibles, comentarios y mensajes de commit. Identificadores en inglés.
- **Logs (`console.log` y `APP_LOG`) solo en ASCII**: con acentos o ñ, `pebble logs` corta el
  mensaje y se cae con `UnicodeDecodeError`, y se pierde todo el stream.

## Decisiones no obvias (no "arreglarlas")

- **Rangos de color de glucosa se reenvían con cada lectura** (`addRanges` en `index.js`), no
  solo al abrir/guardar: corrige un bug real donde el reloj quedó con umbrales viejos. Por eso
  el inbox del reloj es de 128 bytes (glucosa + 4 rangos en un mensaje).
- **Vibración al cambiar de zona de glucosa** (verde/amarillo/rojo): `notify_zone_change` en el
  reloj. Doble pulso al entrar en rojo, corto en el resto. Solo con una lectura **nueva**
  (`GLUCOSE_TIME` distinto del guardado) y habiendo una previa; compara ambas lecturas con los
  **rangos actuales**, por eso en `inbox_received_handler` los rangos se aplican **antes** que
  la glucosa. Cambiar los rangos en la config no hace vibrar por sí solo.
- **Alerta de teléfono perdido**: al cortarse el Bluetooth (`connection_service`), pantalla
  completa 30 s (`ALERT_SECONDS`) + 5 ráfagas de vibración cada 10 s (con `light_enable_interaction`
  para que se encienda la luz), y **marco rojo** mientras
  siga desconectado. Tres pantallas (HAL 9000, Matrix, Blade Runner) que **rotan en cada
  desconexión**: se dibuja `s_alert_style` y en `persist` queda guardado el siguiente, que se
  aplica al terminar el aviso o al reconectar. Textos con fuentes del sistema (las Russo tienen
  `characterRegex` y no traen espacios ni minúsculas). En el emulador `emu-bt-connection` tarda
  varios segundos en llegar: para probar, sacar capturas en serie.
- **Todas las horas en 24 h** (`%H:%M`, sin cero inicial), ignorando la configuración 12/24 h
  del reloj: pedido explícito (en 12 h "6:00" de un evento sin AM/PM era ambiguo).
- **Varios calendarios**: hasta 4 enlaces iCal (`ICS_URL`, `ICS_URL_2..4`). El teléfono pide
  todos y combina con `calendar.merge`: evento anterior más reciente y próximo más cercano.
  Un calendario que falle se saltea (los demás igual se muestran).
- **Cumpleaños**: ⚠️ **Google NO los exporta al iCal**, ni siquiera con "Sincronizar con
  <cuenta>" activado en el calendario "Cumpleaños" (verificado 2026-09-20 con logs). Por eso
  se usa `tools/cumples.gs`: un Apps Script en la cuenta del dueño, publicado como aplicación
  web, que lee los eventos `eventTypes: ['birthday']` de la API de Calendar y responde
  `{"birthday": AAAAMMDD, "nextBirthday": AAAAMMDD}` (0 = no hay), sin nombres. Su URL (con
  token) va en `BIRTHDAY_URL`. Si está configurada, manda sobre lo que digan los iCal.
  Detección de respaldo en los iCal: eventos de **día completo** cuyo título contiene
  "cumplea"/"birthday" (`BIRTHDAY_RE` en `calendar.js`), para cuando el calendario sí los trae.
  El teléfono manda `BIRTHDAY` como fecha `AAAAMMDD` (no un booleano): el reloj muestra la torta
  solo si coincide con hoy, así desaparece a medianoche aunque no haya teléfono.
- **Plugin de calendario de la app** (futuro): la app nueva trae un `CalendarPlugin`
  (`Pebble.subscribeToSource({category:'calendar', item:'event'})`) con los próximos eventos de
  **todos** los calendarios, cumpleaños incluidos, sin iCal. Hoy no sirve: el registro de
  plugins está detrás del flag `enablePlugins`, apagado (el teléfono responde
  `PLUGIN_UNAVAILABLE`). Cuando se habilite, reemplaza iCal + script (pero solo da eventos
  futuros: el "anterior" seguiría necesitando iCal). Requiere `"usesPermissions": ["Calendar"]`
  en `package.json`.
- **Eventos vía iCal y no Timeline**: el SDK no permite leer pins del Timeline.
- **`ical.js` fijo en 1.x**: la 2.x es ESM y no funciona en pkjs.
- **LibreLinkUp es una API no oficial** (referencias: nightscout-librelink-up, pylibrelinkup).
  Si deja de andar, lo primero es subir `LLU_VERSION` en `glucose.js`. El header `account-id`
  es SHA-256 del user id, implementado a mano (pkjs no tiene `crypto`).
- **Configuración (Clay) queda solo en `localStorage` del teléfono**; el enlace iCal y las
  credenciales nunca se mandan al reloj ni se loguean. `ICS_URL`, `LLU_EMAIL` y `LLU_PASSWORD`
  existen como messageKeys solo para Clay.
- El reloj pide glucosa y eventos **en un solo mensaje** y el teléfono envía con **cola**:
  no se puede mandar un AppMessage mientras otro está en curso.
- Colores con significado (glucosa por rango, relleno de pila) no dependen del skin (`SKIN_*`).
- Fuentes con `characterRegex`: si se agregan caracteres nuevos al texto (p. ej. otra letra con
  tilde), ampliar el regex o no se dibujan.

## Particularidades del tooling

- `pebble wipe` borra también la carpeta `localstorage` de pypkjs: recrearla (`mkdir -p`) antes
  de escribir `clay-settings`. La vibración no se percibe en el emulador: verificar con `APP_LOG`.
- `pebble emu-set-time` no cambia la fecha que ve la watchface: para probar fechas, build
  temporal forzando `s_now`.
- Dev Connect se desconecta seguido: si queda en `Waiting for phone to connect...`, pedir al
  usuario reactivarlo en la app Pebble. Admite **una sola conexión** (`install` corta un
  `logs` en curso). `pebble install --cloudpebble --logs` falla (`AttributeError: sourcemap`).
  Con salida por pipe usar `PYTHONUNBUFFERED=1`.
- La app Pebble de Android (libpebble3) manda los números de `sendAppMessage` como `int32`.
- El ícono del `.pbw` (`menuIcon: true` en los recursos) no puede pasar de **25×25 px** o el
  build falla. La miniatura que muestra la app del teléfono en la lista de watchfaces sale del
  appstore (`screenshotImageUrl`), no del pbw: una app sideloaded no puede tenerla.

## Probar sin reloj ni APIs reales

- Configuración del emulador: con el emulador cerrado (`pebble kill`), escribir la clave
  `clay-settings` (JSON) en `~/.local/share/pebble-sdk/4.33.1/emery/localstorage/<uuid>`
  (formato `dbm.dumb` de Python). Limpiarla al terminar.
- Calendario: servir un `.ics` de prueba con `python3 -m http.server` y apuntar `ICS_URL` a
  `http://127.0.0.1:<puerto>/…`. Usar eventos relativos a la hora actual.
- Glucosa: servidor Python que imite `POST /llu/auth/login` y `GET /llu/connections` (validando
  headers `product`, `version`, `account-id`) + build temporal con `LLU_HOST` local en `glucose.js`.
- Tests de node para `glucose.js`/`calendar.js`: `require` directo; simular `XMLHttpRequest` y
  `localStorage` como globales.
