// Busca en un calendario iCal el evento anterior y el próximo respecto de "now".
// Considera eventos recurrentes (RRULE/EXDATE/instancias modificadas) y zonas
// horarias (VTIMEZONE). Ignora eventos de día completo y cancelados.

var ICAL = require('ical.js');

var LOOK_WINDOW_MS = 7 * 24 * 3600 * 1000;  // no mirar más de una semana atrás/adelante
var MAX_OCCURRENCES = 20000;                // tope de seguridad por evento recurrente

function isCancelled(event) {
  return event.component.getFirstPropertyValue('status') === 'CANCELLED';
}

// Devuelve { prev, next } en segundos Unix (0 = no hay).
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

  function consider(startDate, event) {
    if (startDate.isDate || isCancelled(event)) {
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
    next: nextMs === null ? 0 : Math.floor(nextMs / 1000)
  };
}

module.exports = { findPrevNext: findPrevNext };
