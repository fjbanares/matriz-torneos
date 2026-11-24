-- 003 · Catálogo de facciones de Warhammer 40k actualizado (23 ejércitos con códex propio).
-- Renombra el único nombre antiguo que cambia para que los datos guardados sigan siendo válidos.
UPDATE tournament_players SET faction = 'Emperor’s Children' WHERE faction = 'Emperors Children';
UPDATE matrix_rivals SET faction = 'Emperor’s Children' WHERE faction = 'Emperors Children';
