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
    type: 'submit',
    defaultValue: 'Guardar'
  }
];
