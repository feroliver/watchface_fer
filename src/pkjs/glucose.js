// Última lectura de glucosa desde LibreLinkUp (la nube "seguidores" de Abbott).
// API NO OFICIAL: la misma que usan nightscout-librelink-up y pylibrelinkup.
// Puede dejar de funcionar si Abbott la cambia (suele bastar con subir LLU_VERSION).

var LLU_HOST = 'https://api.libreview.io';
var LLU_VERSION = '4.16.0';
var TOKEN_KEY = 'llu-auth';

// ── SHA-256 (el header account-id es el hash del id de usuario) ─────────────────

var K = [];
(function () {
  var n = 2;
  while (K.length < 64) {
    var prime = true;
    for (var d = 2; d * d <= n; d++) {
      if (n % d === 0) { prime = false; break; }
    }
    if (prime) {
      K.push((Math.pow(n, 1 / 3) % 1) * 4294967296 | 0);
    }
    n++;
  }
})();

function sha256Hex(ascii) {
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
           0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var bytes = [];
  for (var i = 0; i < ascii.length; i++) {
    bytes.push(ascii.charCodeAt(i) & 0xff);
  }
  var bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }
  for (i = 7; i >= 0; i--) {
    bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  }

  var w = new Array(64);
  for (var off = 0; off < bytes.length; off += 64) {
    for (i = 0; i < 16; i++) {
      w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) |
             (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
    }
    for (i = 16; i < 64; i++) {
      var s15 = w[i - 15], s2 = w[i - 2];
      var r15 = (s15 >>> 7) | (s15 << 25);
      var r2 = ((s2 >>> 17) | (s2 << 15)) ^ ((s2 >>> 19) | (s2 << 13)) ^ (s2 >>> 10);
      w[i] = (w[i - 16] + (r15 ^ ((s15 >>> 18) | (s15 << 14)) ^ (s15 >>> 3)) + w[i - 7] + r2) | 0;
    }
    var a = h[0], b = h[1], c = h[2], dd = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (i = 0; i < 64; i++) {
      var t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) +
                ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      var t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
                ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (dd + t1) | 0;
      dd = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h = [h[0] + a | 0, h[1] + b | 0, h[2] + c | 0, h[3] + dd | 0,
         h[4] + e | 0, h[5] + f | 0, h[6] + g | 0, h[7] + hh | 0];
  }
  return h.map(function (v) {
    return ('00000000' + (v >>> 0).toString(16)).slice(-8);
  }).join('');
}

// ── API ──────────────────────────────────────────────────────────────────────────

// "9/14/2026 10:12:34 PM" (FactoryTimestamp, en UTC) -> segundos Unix.
function parseFactoryTimestamp(text) {
  var m = /^(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+)(?: ?([AP]M))?$/i.exec((text || '').trim());
  if (!m) {
    return 0;
  }
  var hour = parseInt(m[4], 10) % (m[7] ? 12 : 24);
  if (m[7] && m[7].toUpperCase() === 'PM') {
    hour += 12;
  }
  return Math.floor(Date.UTC(+m[3], +m[1] - 1, +m[2], hour, +m[5], +m[6]) / 1000);
}

function request(method, url, body, auth, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open(method, url);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('product', 'llu.android');
  xhr.setRequestHeader('version', LLU_VERSION);
  if (auth) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + auth.token);
    xhr.setRequestHeader('account-id', auth.accountId);
  }
  xhr.onload = function () {
    var json = null;
    try {
      json = JSON.parse(xhr.responseText);
    } catch (e) {
      // se reporta abajo como respuesta inválida
    }
    if (xhr.status !== 200 || !json) {
      callback('HTTP ' + xhr.status);
    } else {
      callback(null, json);
    }
  };
  xhr.onerror = function () {
    callback('error de red');
  };
  xhr.send(body ? JSON.stringify(body) : null);
}

function loadAuth() {
  try {
    var auth = JSON.parse(localStorage.getItem(TOKEN_KEY));
    if (auth && auth.token && auth.expires > Date.now() / 1000 + 60) {
      return auth;
    }
  } catch (e) {
    // sin token guardado
  }
  return null;
}

function login(credentials, host, callback, redirects) {
  request('POST', host + '/llu/auth/login',
    { email: credentials.email, password: credentials.password }, null, function (err, json) {
      if (err) {
        return callback('login: ' + err);
      }
      var data = json.data || {};
      if (data.redirect && data.region && !redirects) {
        return login(credentials, 'https://api-' + data.region + '.libreview.io', callback, 1);
      }
      if (data.step && data.step.type) {
        return callback('login: hay que aceptar "' + data.step.type + '" en la app LibreLinkUp');
      }
      if (json.status !== 0 || !data.authTicket || !data.user) {
        return callback('login: credenciales inválidas (status ' + json.status + ')');
      }
      var auth = {
        host: host,
        token: data.authTicket.token,
        expires: data.authTicket.expires,
        accountId: sha256Hex(data.user.id)
      };
      localStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
      callback(null, auth);
    });
}

// callback(err, { value: mg/dL, trend: 1..5 (0 = sin dato), time: segundos Unix })
function fetchLatest(credentials, callback, retried) {
  var auth = loadAuth();
  if (!auth) {
    return login(credentials, LLU_HOST, function (err) {
      if (err) {
        return callback(err);
      }
      fetchLatest(credentials, callback, true);
    });
  }
  request('GET', auth.host + '/llu/connections', null, auth, function (err, json) {
    if (err || json.status !== 0) {
      localStorage.removeItem(TOKEN_KEY);
      if (!retried) {
        return fetchLatest(credentials, callback, true);
      }
      return callback('connections: ' + (err || 'status ' + json.status));
    }
    var connection = (json.data || [])[0];
    var measurement = connection && connection.glucoseMeasurement;
    if (!measurement) {
      return callback('connections: la cuenta no sigue a nadie o no hay lecturas');
    }
    callback(null, {
      value: measurement.ValueInMgPerDl,
      trend: measurement.TrendArrow || 0,
      time: parseFactoryTimestamp(measurement.FactoryTimestamp)
    });
  });
}

function forgetSession() {
  localStorage.removeItem(TOKEN_KEY);
}

module.exports = {
  fetchLatest: fetchLatest,
  forgetSession: forgetSession,
  sha256Hex: sha256Hex,
  parseFactoryTimestamp: parseFactoryTimestamp
};
