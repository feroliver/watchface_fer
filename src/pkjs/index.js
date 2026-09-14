// Lado teléfono: descarga el calendario iCal configurado y manda al reloj la
// hora de inicio del evento anterior y del próximo (segundos Unix, 0 = no hay).

var Clay = require('pebble-clay');
var clayConfig = require('./config');
var calendar = require('./calendar');

var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

function icsUrl() {
  try {
    var settings = JSON.parse(localStorage.getItem('clay-settings')) || {};
    return (settings.ICS_URL || '').trim().replace(/^webcal:\/\//i, 'https://');
  } catch (e) {
    return '';
  }
}

function sendEvents(events) {
  Pebble.sendAppMessage({ PREV_EVENT: events.prev, NEXT_EVENT: events.next }, null, function () {
    console.log('No se pudieron enviar los eventos al reloj');
  });
}

function updateEvents() {
  var url = icsUrl();
  if (!url) {
    sendEvents({ prev: 0, next: 0 });
    return;
  }
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    if (xhr.status !== 200) {
      console.log('Calendario: HTTP ' + xhr.status);
      return;
    }
    try {
      sendEvents(calendar.findPrevNext(xhr.responseText, new Date()));
    } catch (e) {
      console.log('Calendario inválido: ' + e.message);
    }
  };
  xhr.onerror = function () {
    console.log('Calendario: error de red');
  };
  // No loguear la URL: es secreta.
  xhr.open('GET', url);
  xhr.send();
}

Pebble.addEventListener('ready', updateEvents);

Pebble.addEventListener('appmessage', function (e) {
  if (e.payload.REQUEST_EVENTS !== undefined) {
    updateEvents();
  }
});

Pebble.addEventListener('showConfiguration', function () {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (e && e.response) {
    clay.getSettings(e.response);  // guarda ICS_URL en localStorage
    updateEvents();
  }
});
