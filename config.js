// Catálogos del dominio: juegos, facciones y disposiciones.
// Fuente única de verdad: el backend valida con estos datos y el frontend los recibe de /api/tournaments/meta.

const GAMES = {
  '40k': {
    label: 'Warhammer 40.000',
    available: true,
    factions: [
      'Emperors Children',
      'Genestealer Cults',
      'Grey Knights',
      'Imperial Knights',
      'Leagues of Votann',
      'Necrons',
      'Orks',
      'Space Marines',
      'T’au Empire',
      'Thousand Sons',
      'Tyranids',
      'World Eaters',
    ],
  },
  sigmar: {
    label: 'Age of Sigmar',
    available: false, // pendiente: se activará cuando se añadan sus facciones
    factions: [],
  },
};

// Una columna por disposición. "color" es solo para la presentación; el nombre siempre se muestra en texto.
const DISPOSITIONS = [
  { key: 'disruption', label: 'Disruption', color: 'azul' },
  { key: 'priority-assets', label: 'Priority Assets', color: 'amarillo' },
  { key: 'take-and-hold', label: 'Take and Hold', color: 'verde' },
  { key: 'reconnaissance', label: 'Reconnaissance', color: 'turquesa' },
  { key: 'purge-the-foe', label: 'Purge the Foe', color: 'rojo' },
];

const MAX_PLAYERS = 20;

module.exports = { GAMES, DISPOSITIONS, MAX_PLAYERS };
