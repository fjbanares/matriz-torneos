-- 007 · Lista de cada rival: texto pegado a mano o enlace a su lista en BCP.
ALTER TABLE matrix_rivals ADD COLUMN IF NOT EXISTS list_text TEXT NOT NULL DEFAULT '';
ALTER TABLE matrix_rivals ADD COLUMN IF NOT EXISTS list_url TEXT;
