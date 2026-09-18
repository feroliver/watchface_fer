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

## Decisiones no obvias (no "arreglarlas")

- **Rangos de color de glucosa se reenvían con cada lectura** (`addRanges` en `index.js`), no
  solo al abrir/guardar: corrige un bug real donde el reloj quedó con umbrales viejos. Por eso
  el inbox del reloj es de 128 bytes (glucosa + 4 rangos en un mensaje).
- **Todas las horas en 24 h** (`%H:%M`, sin cero inicial), ignorando la configuración 12/24 h
  del reloj: pedido explícito (en 12 h "6:00" de un evento sin AM/PM era ambiguo).
- **Cumpleaños**: salen del mismo iCal del calendario principal. Google solo los incluye si en
  el calendario "Cumpleaños" está activado "Sincronizar con <cuenta>" (si no, viven en Contactos
  y no hay iCal). Se detectan como eventos de **día completo** cuyo título contiene
  "cumplea"/"birthday" (`BIRTHDAY_RE` en `calendar.js`). El teléfono manda `BIRTHDAY` como
  fecha `AAAAMMDD` (no un booleano): el reloj muestra la torta solo si coincide con hoy, así
  desaparece a medianoche aunque no haya teléfono. Los nombres nunca se mandan ni se loguean.
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

- `pebble emu-set-time` no cambia la fecha que ve la watchface: para probar fechas, build
  temporal forzando `s_now`.
- Dev Connect se desconecta seguido: si queda en `Waiting for phone to connect...`, pedir al
  usuario reactivarlo en la app Pebble. Admite **una sola conexión** (`install` corta un
  `logs` en curso). `pebble install --cloudpebble --logs` falla (`AttributeError: sourcemap`).
  Con salida por pipe usar `PYTHONUNBUFFERED=1`.
- La app Pebble de Android (libpebble3) manda los números de `sendAppMessage` como `int32`.

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
