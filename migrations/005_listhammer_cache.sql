-- 005 · Caché de las tablas Matchups de Listhammer (una fila por facción).
-- Evita volver a visitar la web en cada sugerencia: la caché dura 24 horas.
CREATE TABLE IF NOT EXISTS listhammer_cache (
  faction_slug TEXT PRIMARY KEY,
  dataslate    TEXT NOT NULL,
  rows         JSONB NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
