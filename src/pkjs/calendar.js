// Busca en un calendario iCal el evento anterior y el próximo respecto de "now", y si hoy
// hay un cumpleaños. Considera eventos recurrentes (RRULE/EXDATE/instancias modificadas) y
// zonas horarias (VTIMEZONE). Ignora eventos cancelados; los de día completo solo cuentan
// como cumpleaños.

var ICAL = require('ical.js');

var LOOK_WINDOW_MS = 7 * 24 * 3600 * 1000;  // no mirar más de una semana atrás/adelante
var MAX_OCCURRENCES = 20000;                // tope de seguridad por evento recurrente

function isCancelled(event) {
  return event.component.getFirstPropertyValue('status') === 'CANCELLED';
}

// Los cumpleaños de Google Contacts (calendario "Cumpleaños" sincronizado con el principal)
// llegan como eventos de día completo "Cumpleaños de …" / "¡Feliz cumpleaños!".
var BIRTHDAY_RE = /cumplea|birthday/i;

// Fecha como número AAAAMMDD, comparable entre el teléfono y el reloj.
function ymd(year, month, day) {
  return year * 10000 + month * 100 + day;
}

// Devuelve { prev, next } en segundos Unix (0 = no hay), birthday = AAAAMMDD de hoy si hay un
// cumpleaños hoy (0 = no) y nextBirthday = AAAAMMDD del próximo en la ventana (0 = no hay).
function findPrevNext(icsText, now) {
  var root = new ICAL.Component(ICAL.parse(icsText));
  root.getAllSubcomponents('vtimezone').forEach(function (vtimezone) {
    ICAL.TimezoneService.register(vtimezone);
  });

  var nowMs = now.getTime();
  var fromMs = nowMs - LOOK_WINDOW_MS;
  var toMs = nowMs + LOOK_WINDOW_MS;
  var prevMs = null;
  var nextMs = null;
  var today = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
  var nextBirthday = 0;

  function consider(startDate, event) {
    if (isCancelled(event)) {
      return;
    }
    if (startDate.isDate) {
      var day = ymd(startDate.year, startDate.month, startDate.day);
      if (day >= today && BIRTHDAY_RE.test(event.summary || '') &&
          (nextBirthday === 0 || day < nextBirthday)) {
        nextBirthday = day;
      }
      return;
    }
    var ms = startDate.toJSDate().getTime();
    if (ms <= nowMs && ms >= fromMs && (prevMs === null || ms > prevMs)) {
      prevMs = ms;
    } else if (ms > nowMs && ms <= toMs && (nextMs === null || ms < nextMs)) {
      nextMs = ms;
    }
  }

  var masters = {};
  var exceptions = [];
  root.getAllSubcomponents('vevent').forEach(function (vevent) {
    var event = new ICAL.Event(vevent);
    if (event.isRecurrenceException()) {
      exceptions.push(event);
    } else if (event.isRecurring()) {
      masters[event.uid] = event;
    } else {
      consider(event.startDate, event);
    }
  });

  exceptions.forEach(function (exception) {
    var master = masters[exception.uid];
    if (master) {
      master.relateException(exception);
    } else {
      consider(exception.startDate, exception);
    }
  });

  Object.keys(masters).forEach(function (uid) {
    var master = masters[uid];
    var iterator = master.iterator();
    var occurrence;
    for (var i = 0; i < MAX_OCCURRENCES && (occurrence = iterator.next()); i++) {
      // Margen de un día por instancias movidas fuera de su fecha original.
      if (occurrence.toJSDate().getTime() > toMs + 24 * 3600 * 1000) {
        break;
      }
      var details = master.getOccurrenceDetails(occurrence);
      consider(details.startDate, details.item);
    }
  });

  return {
    prev: prevMs === null ? 0 : Math.floor(prevMs / 1000),
    next: nextMs === null ? 0 : Math.floor(nextMs / 1000),
    birthday: nextBirthday === today ? today : 0,
    nextBirthday: nextBirthday
  };
}

// Combina los resultados de varios calendarios en uno solo: el evento anterior más reciente,
// el próximo más cercano y el cumpleaños más cercano.
function merge(results) {
  var merged = { prev: 0, next: 0, birthday: 0, nextBirthday: 0 };
  results.forEach(function (r) {
    if (r.prev && r.prev > merged.prev) {
      merged.prev = r.prev;
    }
    if (r.next && (merged.next === 0 || r.next < merged.next)) {
      merged.next = r.next;
    }
    if (r.birthday) {
      merged.birthday = r.birthday;
    }
    if (r.nextBirthday && (merged.nextBirthday === 0 || r.nextBirthday < merged.nextBirthday)) {
      merged.nextBirthday = r.nextBirthday;
    }
  });
  return merged;
}

module.exports = { findPrevNext: findPrevNext, merge: merge };
