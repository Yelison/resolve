-- El feed de actividad reciente lee las últimas entradas de una organización por fecha: con este índice se detiene
-- tras las primeras filas en lugar de recorrer y ordenar toda la actividad de todas las organizaciones.

CREATE INDEX ticket_activities_feed_idx ON ticket_activities (organization_id, created_at DESC, id DESC);
