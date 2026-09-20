/**
 * Cumpleaños para watchface_fer.
 *
 * Google no exporta los cumpleaños de Contactos al iCal, pero sí los muestra en su API como
 * eventos de día completo. Este script se publica como "aplicación web" y responde si hoy hay
 * cumpleaños, sin nombres:
 *
 *   {"birthday": 20260921, "nextBirthday": 20260921}   // AAAAMMDD, 0 = no hay
 *
 * Cómo publicarlo (una vez, en la cuenta de Google del dueño del calendario):
 *   1. script.google.com → Nuevo proyecto → pegar este archivo.
 *   2. Servicios (+) → "Google Calendar API" → Agregar (se usa como servicio avanzado).
 *   3. Cambiar TOKEN por una palabra secreta cualquiera.
 *   4. Implementar → Nueva implementación → Tipo: Aplicación web.
 *      Ejecutar como: yo. Quién tiene acceso: cualquier usuario.
 *   5. Autorizar cuando lo pida y copiar la URL (termina en /exec).
 *   6. Pegar en los ajustes del watchface:  <URL>?t=<TOKEN>
 *
 * La URL es secreta: quien la tenga puede saber si hoy hay un cumpleaños (nada más).
 */

var TOKEN = 'cambiar-esto';
var DAYS_AHEAD = 8;

function doGet(e) {
  if (TOKEN && (!e || !e.parameter || e.parameter.t !== TOKEN)) {
    return json({ error: 'token' });
  }
  try {
    return json(birthdays());
  } catch (err) {
    return json({ error: String(err) });
  }
}

function birthdays() {
  var timeZone = Session.getScriptTimeZone();
  var now = new Date();
  var from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var to = new Date(from.getTime() + DAYS_AHEAD * 24 * 3600 * 1000);
  var today = Number(Utilities.formatDate(now, timeZone, 'yyyyMMdd'));

  var events = Calendar.Events.list('primary', {
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    eventTypes: ['birthday'],
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100
  }).items || [];

  var todayBirthday = 0;
  var next = 0;
  events.forEach(function (event) {
    var date = event.start && event.start.date;  // día completo: "AAAA-MM-DD"
    if (!date) {
      return;
    }
    var day = Number(date.replace(/-/g, ''));
    if (day === today) {
      todayBirthday = day;
    }
    if (day >= today && (next === 0 || day < next)) {
      next = day;
    }
  });
  return { birthday: todayBirthday, nextBirthday: next };
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Para probarlo desde el editor: ver el resultado en Ejecuciones. */
function probar() {
  Logger.log(birthdays());
}
