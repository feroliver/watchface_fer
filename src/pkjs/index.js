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

// Varios calendarios: se pide cada iCal y se combinan los resultados. Los cumpleaños salen
// del script de Apps Script si está configurado (Google no los exporta al iCal), y si no, de
// los propios calendarios.
function calendarUrls() {
  var s = settings();
  return ['ICS_URL', 'ICS_URL_2', 'ICS_URL_3', 'ICS_URL_4'].map(function (key) {
    return (s[key] || '').trim().replace(/^webcal:\/\//i, 'https://');
  }).filter(function (url) {
    return url;
  });
}

function fetchText(url, onText, onDone) {
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    if (xhr.status === 200) {
      onText(xhr.responseText);
    } else {
      console.log('Calendario: HTTP ' + xhr.status);
    }
    onDone();
  };
  xhr.onerror = function () {
    console.log('Calendario: error de red');
    onDone();
  };
  // No loguear las URLs: son secretas.
  xhr.open('GET', url);
  xhr.send();
}

function updateEvents() {
  var urls = calendarUrls();
  var birthdayUrl = (settings().BIRTHDAY_URL || '').trim();
  if (urls.length === 0 && !birthdayUrl) {
    send({ PREV_EVENT: 0, NEXT_EVENT: 0, BIRTHDAY: 0 });
    return;
  }

  var now = new Date();
  var results = [];
  var fromScript = null;
  var pending = urls.length + (birthdayUrl ? 1 : 0);

  function finish() {
    if (--pending > 0) {
      return;
    }
    var events = calendar.merge(results);
    if (fromScript) {
      events.birthday = fromScript.birthday || 0;
      events.nextBirthday = fromScript.nextBirthday || 0;
    }
    // Solo fechas, nunca nombres. Sin acentos: `pebble logs` se cae con UTF-8 cortado.
    console.log('Calendarios: ' + results.length + '/' + urls.length + ' | cumple hoy ' +
      (events.birthday ? 'si' : 'no') + ', proximo ' + (events.nextBirthday || 'ninguno') +
      (birthdayUrl ? (fromScript ? ' (script)' : ' (script fallo)') : ''));
    send({ PREV_EVENT: events.prev, NEXT_EVENT: events.next, BIRTHDAY: events.birthday });
  }

  urls.forEach(function (url) {
    fetchText(url, function (text) {
      try {
        results.push(calendar.findPrevNext(text, now));
      } catch (e) {
        console.log('Calendario invalido: ' + e.message);
      }
    }, finish);
  });

  if (birthdayUrl) {
    fetchText(birthdayUrl, function (text) {
      try {
        var parsed = JSON.parse(text);
        if (parsed && !parsed.error) {
          fromScript = parsed;
        } else {
          console.log('Cumples: el script respondio ' + (parsed && parsed.error));
        }
      } catch (e) {
        console.log('Cumples: respuesta invalida del script');
      }
    }, finish);
  }
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
    send(addRanges({ GLUCOSE: reading.value, GLUCOSE_TREND: reading.trend, GLUCOSE_TIME: reading.time }));
  });
}

// Los rangos se guardan en el reloj (el color funciona aunque no haya teléfono) y se
// reenvían con cada lectura: si el reloj quedó con umbrales viejos se corrige solo.
function addRanges(message) {
  var ranges = glucose.parseRanges(settings());
  message.GLUCOSE_RED_LOW = ranges.redLow;
  message.GLUCOSE_TARGET_LOW = ranges.targetLow;
  message.GLUCOSE_TARGET_HIGH = ranges.targetHigh;
  message.GLUCOSE_RED_HIGH = ranges.redHigh;
  return message;
}

function sendRanges() {
  send(addRanges({}));
}

// ── Eventos de PebbleKit JS ──────────────────────────────────────────────────────

Pebble.addEventListener('ready', function () {
  sendRanges();
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
    sendRanges();
    updateGlucose();
    updateEvents();
  }
});
