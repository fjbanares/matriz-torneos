-- 004 · Marca de "elige mapa" por casilla de la matriz.
-- Una fila por casilla marcada; las casillas sin marca no ocupan filas.
CREATE TABLE IF NOT EXISTS matrix_map_flags (
  matrix_id INTEGER NOT NULL REFERENCES matrices(id) ON DELETE CASCADE,
  row_slot  SMALLINT NOT NULL CHECK (row_slot >= 0),
  col_slot  SMALLINT NOT NULL CHECK (col_slot >= 0),
  PRIMARY KEY (matrix_id, row_slot, col_slot)
);
