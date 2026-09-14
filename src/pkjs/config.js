// Página de configuración (Clay), se abre desde la app de Pebble del teléfono.
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
      {
        type: 'input',
        messageKey: 'ICS_URL',
        label: 'Enlace iCal',
        attributes: {
          type: 'url',
          placeholder: 'https://calendar.google.com/calendar/ical/.../basic.ics'
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
    type: 'submit',
    defaultValue: 'Guardar'
  }
];
