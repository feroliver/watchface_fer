// Lado teléfono: calendario (evento anterior/próximo) y glucosa (LibreLinkUp).
// Todo lo configurado (enlace iCal, cuenta LibreLinkUp) queda solo en el teléfono.

var Clay = require('pebble-clay');
var clayConfig = require('./config');
var calendar = require('./calendar');
var glucose = require('./glucose');

var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

function settings() {
  try {
    return JSON.parse(localStorage.getItem('clay-settings')) || {};
  } catch (e) {
    return {};
  }
}

// Cola de mensajes: el reloj no acepta un envío mientras hay otro en curso.
var outbox = [];
var sending = false;

function send(message) {
  outbox.push(message);
  sendNext();
}

function sendNext() {
  if (sending || outbox.length === 0) {
    return;
  }
  sending = true;
  var done = function () {
    sending = false;
    sendNext();
  };
  Pebble.sendAppMessage(outbox.shift(), done, function () {
    console.log('No se pudo enviar un mensaje al reloj');
    done();
  });
}

// ── Calendario ───────────────────────────────────────────────────────────────────

function updateEvents() {
  var url = (settings().ICS_URL || '').trim().replace(/^webcal:\/\//i, 'https://');
  if (!url) {
    send({ PREV_EVENT: 0, NEXT_EVENT: 0 });
    return;
  }
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    if (xhr.status !== 200) {
      console.log('Calendario: HTTP ' + xhr.status);
      return;
    }
    try {
      var events = calendar.findPrevNext(xhr.responseText, new Date());
      send({ PREV_EVENT: events.prev, NEXT_EVENT: events.next });
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

// ── Glucosa ──────────────────────────────────────────────────────────────────────

function updateGlucose() {
  var s = settings();
  var credentials = { email: (s.LLU_EMAIL || '').trim(), password: s.LLU_PASSWORD || '' };
  if (!credentials.email || !credentials.password) {
    return;
  }
  glucose.fetchLatest(credentials, function (err, reading) {
    if (err) {
      // Sin envío: el reloj muestra "G ---" cuando la última lectura queda vieja.
      console.log('Glucosa: ' + err);
      return;
    }
    send({ GLUCOSE: reading.value, GLUCOSE_TREND: reading.trend, GLUCOSE_TIME: reading.time });
  });
}

// ── Eventos de PebbleKit JS ──────────────────────────────────────────────────────

Pebble.addEventListener('ready', function () {
  updateGlucose();
  updateEvents();
});

Pebble.addEventListener('appmessage', function (e) {
  if (e.payload.REQUEST_GLUCOSE !== undefined) {
    updateGlucose();
  }
  if (e.payload.REQUEST_EVENTS !== undefined) {
    updateEvents();
  }
});

Pebble.addEventListener('showConfiguration', function () {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (e && e.response) {
    clay.getSettings(e.response);  // guarda la configuración en localStorage
    glucose.forgetSession();       // por si cambió la cuenta
    updateGlucose();
    updateEvents();
  }
});
