-- Los informes cuentan tickets por fecha de creación dentro de una organización (periodo actual y anterior): sin este
-- índice cada consulta recorrería todos los tickets de la organización. Los tickets resueltos usan el índice parcial
-- ticket_activities_resolved_idx de V2.

CREATE INDEX tickets_organization_created_idx ON tickets (organization_id, created_at);
