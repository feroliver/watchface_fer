// Lado teléfono: obtiene la ubicación, calcula amanecer/atardecer de hoy y se
// los manda al reloj en minutos desde la medianoche local (-1 = no hay).

var RAD = Math.PI / 180;

function sin(deg) { return Math.sin(deg * RAD); }
function cos(deg) { return Math.cos(deg * RAD); }

// "Sunrise equation" (https://en.wikipedia.org/wiki/Sunrise_equation).
// lat/lon en grados decimales (lon positiva al este). Devuelve {sunrise, sunset}
// en minutos locales, o null si ese día el sol no sale o no se pone.
function sunTimes(lat, lon, date) {
  var noonUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  var julianDay = noonUtc / 86400000 + 2440587.5;
  var n = Math.round(julianDay - 2451545.0 + 0.0008);

  var meanSolarNoon = n - lon / 360;
  var anomaly = (357.5291 + 0.98560028 * meanSolarNoon) % 360;
  var center = 1.9148 * sin(anomaly) + 0.02 * sin(2 * anomaly) + 0.0003 * sin(3 * anomaly);
  var eclipticLon = (anomaly + center + 180 + 102.9372) % 360;
  var transit = 2451545.0 + meanSolarNoon + 0.0053 * sin(anomaly) - 0.0069 * sin(2 * eclipticLon);

  var sinDecl = sin(eclipticLon) * sin(23.4397);
  var cosDecl = Math.sqrt(1 - sinDecl * sinDecl);
  var cosHourAngle = (sin(-0.833) - sin(lat) * sinDecl) / (cos(lat) * cosDecl);
  if (cosHourAngle < -1 || cosHourAngle > 1) {
    return null;
  }
  var hourAngle = Math.acos(cosHourAngle) / RAD;

  return {
    sunrise: julianToLocalMinutes(transit - hourAngle / 360),
    sunset: julianToLocalMinutes(transit + hourAngle / 360)
  };
}

function julianToLocalMinutes(julian) {
  var d = new Date((julian - 2440587.5) * 86400000);
  return d.getHours() * 60 + d.getMinutes();
}

function sendSunTimes(position) {
  var times = sunTimes(position.coords.latitude, position.coords.longitude, new Date());
  Pebble.sendAppMessage({
    SUNRISE: times ? times.sunrise : -1,
    SUNSET: times ? times.sunset : -1
  }, null, function () {
    console.log('No se pudo enviar amanecer/atardecer al reloj');
  });
}

function updateSunTimes() {
  navigator.geolocation.getCurrentPosition(sendSunTimes, function (err) {
    console.log('Sin ubicación: ' + err.message);
  }, { timeout: 15000, maximumAge: 6 * 3600 * 1000 });
}

Pebble.addEventListener('ready', updateSunTimes);
Pebble.addEventListener('appmessage', function (e) {
  if (e.payload.REQUEST_SUN !== undefined) {
    updateSunTimes();
  }
});
