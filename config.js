// Catálogos del dominio: juegos, facciones y disposiciones.
// Fuente única de verdad: el backend valida con estos datos y el frontend los recibe de /api/tournaments/meta.

const GAMES = {
  '40k': {
    label: 'Warhammer 40.000',
    available: true,
    factions: [
      'Adepta Sororitas',
      'Black Templars',
      'Blood Angels',
      'Dark Angels',
      'Deathwatch',
      'Adeptus Custodes',
      'Adeptus Mechanicus',
      'Aeldari',
      'Astra Militarum',
      'Chaos Daemons',
      'Chaos Knights',
      'Chaos Space Marines',
      'Death Guard',
      'Drukhari',
      'Emperor’s Children',
      'Genestealer Cults',
      'Grey Knights',
      'Imperial Agents',
      'Imperial Knights',
      'Leagues of Votann',
      'Necrons',
      'Orks',
      'Space Marines',
      'Space Wolves',
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

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

module.exports = { GAMES, DISPOSITIONS, MIN_PLAYERS, MAX_PLAYERS };
