// Página de configuración (Clay), se abre desde la app de Pebble del teléfono.

function calendarInput(messageKey, label) {
  return {
    type: 'input',
    messageKey: messageKey,
    label: label,
    attributes: {
      type: 'url',
      placeholder: 'https://calendar.google.com/calendar/ical/.../basic.ics'
    }
  };
}

function rangeInput(messageKey, label, defaultValue) {
  return {
    type: 'input',
    messageKey: messageKey,
    label: label,
    defaultValue: String(defaultValue),
    attributes: { type: 'number', min: 20, max: 600, step: 1, inputmode: 'numeric' }
  };
}

module.exports = [
  {
    type: 'heading',
    defaultValue: 'Watchface Fer'
  },
  {
    type: 'section',
    items: [
      {
        type: 'heading',
        defaultValue: 'Calendario'
      },
      {
        type: 'text',
        defaultValue: 'Pegá la <b>dirección secreta en formato iCal</b> de Google Calendar ' +
          '(calendar.google.com → Configuración → tu calendario → Integrar el calendario). ' +
          'Se guarda solo en este teléfono.'
      },
      calendarInput('ICS_URL', 'Enlace iCal'),
      calendarInput('ICS_URL_2', 'Otro calendario (opcional)'),
      calendarInput('ICS_URL_3', 'Otro calendario (opcional)'),
      calendarInput('ICS_URL_4', 'Otro calendario (opcional)')
    ]
  },
  {
    type: 'section',
    items: [
      {
        type: 'heading',
        defaultValue: 'Cumpleaños'
      },
      {
        type: 'text',
        defaultValue: 'Google no incluye los cumpleaños en el enlace iCal. Para ver la torta ' +
          'en el reloj hay que publicar el script <b>tools/cumples.gs</b> del proyecto como ' +
          'aplicación web y pegar acá su URL (con el <i>token</i>). Si se deja vacío, los ' +
          'cumpleaños solo salen si algún calendario de arriba los trae como eventos.'
      },
      {
        type: 'input',
        messageKey: 'BIRTHDAY_URL',
        label: 'URL del script',
        attributes: {
          type: 'url',
          placeholder: 'https://script.google.com/macros/s/.../exec?t=...'
        }
      }
    ]
  },
  {
    type: 'section',
    items: [
      {
        type: 'heading',
        defaultValue: 'Glucosa (LibreLinkUp)'
      },
      {
        type: 'text',
        defaultValue: 'Datos de la cuenta <b>seguidora</b> de LibreLinkUp (no la de LibreLink). ' +
          'Se guardan solo en este teléfono. Es una integración no oficial: ' +
          'el valor del reloj es orientativo, no lo uses para decidir dosis.'
      },
      {
        type: 'input',
        messageKey: 'LLU_EMAIL',
        label: 'Email',
        attributes: {
          type: 'email',
          autocapitalize: 'off',
          autocorrect: 'off'
        }
      },
      {
        type: 'input',
        messageKey: 'LLU_PASSWORD',
        label: 'Contraseña',
        attributes: {
          type: 'password'
        }
      }
    ]
  },
  {
    type: 'section',
    items: [
      {
        type: 'heading',
        defaultValue: 'Colores de la glucosa (mg/dL)'
      },
      {
        type: 'text',
        defaultValue: '<b>Verde</b>: dentro del objetivo (límites incluidos). ' +
          '<b>Amarillo</b>: fuera del objetivo pero sin pasar los límites rojos. ' +
          '<b>Rojo</b>: por debajo del rojo bajo o por encima del rojo alto.'
      },
      rangeInput('GLUCOSE_RED_LOW', 'Rojo por debajo de', 50),
      rangeInput('GLUCOSE_TARGET_LOW', 'Objetivo desde', 80),
      rangeInput('GLUCOSE_TARGET_HIGH', 'Objetivo hasta', 130),
      rangeInput('GLUCOSE_RED_HIGH', 'Rojo por encima de', 250)
    ]
  },
  {
    type: 'submit',
    defaultValue: 'Guardar'
  }
];
