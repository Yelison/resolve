-- Las organizaciones de demostración (V1000) se insertan sin color ni fecha de «Primeros pasos» (V10 ya está aplicada en
-- las bases que las tienen y no se edita): el color lo pone el disparador de V10 desde el id, y aquí se marcan como ya
-- establecidas, para que «Primeros pasos» no aparezca en ellas. En una base de demostración que ya tenía V1000 antes de
-- V10, la primera sentencia no cambia nada: V10 ya las marcó. La segunda da `first_published_at` a los artículos publicados de
-- la demostración, que V1006 insertó antes de que existiera la columna (en una base nueva V10 va antes y ahí queda nula).

UPDATE organizations SET getting_started_done_at = now()
WHERE getting_started_done_at IS NULL
  AND id IN ('0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000002');

UPDATE articles SET first_published_at = published_at
WHERE first_published_at IS NULL AND published_at IS NOT NULL
  AND organization_id IN ('0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000002');
