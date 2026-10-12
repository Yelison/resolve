-- Las organizaciones de demostración (V1000) se insertan sin color ni fecha de «Primeros pasos» (V10 ya está aplicada en
-- las bases que las tienen y no se edita): el color lo pone el disparador de V10 desde el id, y aquí se marcan como ya
-- establecidas, para que «Primeros pasos» no aparezca en ellas. En una base de demostración que ya tenía V1000 antes de
-- V10, esta sentencia no cambia nada: V10 ya las marcó.

UPDATE organizations SET getting_started_done_at = now()
WHERE getting_started_done_at IS NULL
  AND id IN ('0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000002');
