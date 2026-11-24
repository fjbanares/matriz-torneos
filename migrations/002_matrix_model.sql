-- 002 · Modelo completo de matrices.
-- Sustituye el modelo de matrices de la versión anterior (solo nombre y ejército por jugador).
-- ATENCIÓN: las matrices guardadas con la versión anterior se pierden al aplicar esta migración.
-- Eran datos de prueba; si necesitas conservarlas, avisa antes de migrar.

DROP TABLE IF EXISTS matrix_players;
DROP TABLE IF EXISTS matrices;

-- Jugadores propios del equipo (una fila por hueco 0..N-1)
CREATE TABLE tournament_players (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  slot          SMALLINT NOT NULL CHECK (slot >= 0),
  name          TEXT NOT NULL DEFAULT '',
  faction       TEXT NOT NULL DEFAULT '',
  disposition   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tournament_id, slot)
);

-- Matrices de un torneo, en orden de pestaña
CREATE TABLE matrices (
  id            SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  position      SMALLINT NOT NULL CHECK (position >= 0),
  rival_name    TEXT NOT NULL DEFAULT '',
  UNIQUE (tournament_id, position)
);

-- Columnas rivales de cada matriz (nombre, ejército, disposición) y si están ocultas
CREATE TABLE matrix_rivals (
  matrix_id   INTEGER NOT NULL REFERENCES matrices(id) ON DELETE CASCADE,
  slot        SMALLINT NOT NULL CHECK (slot >= 0),
  name        TEXT NOT NULL DEFAULT '',
  faction     TEXT NOT NULL DEFAULT '',
  disposition TEXT NOT NULL DEFAULT '',
  hidden      BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (matrix_id, slot)
);

-- Filas (jugadores propios) ocultas en cada matriz
CREATE TABLE matrix_rows (
  matrix_id INTEGER NOT NULL REFERENCES matrices(id) ON DELETE CASCADE,
  slot      SMALLINT NOT NULL CHECK (slot >= 0),
  hidden    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (matrix_id, slot)
);

-- Valoraciones 1-7. Solo se guardan las celdas con valor (las vacías no ocupan filas).
CREATE TABLE matrix_cells (
  matrix_id INTEGER NOT NULL REFERENCES matrices(id) ON DELETE CASCADE,
  row_slot  SMALLINT NOT NULL CHECK (row_slot >= 0),
  col_slot  SMALLINT NOT NULL CHECK (col_slot >= 0),
  score     SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 7),
  PRIMARY KEY (matrix_id, row_slot, col_slot)
);
