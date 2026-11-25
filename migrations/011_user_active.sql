-- 011 · Usuarios desactivados: no pueden entrar ni recibir enlaces, y sus sesiones se cierran.
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
