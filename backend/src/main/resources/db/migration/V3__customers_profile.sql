-- Perfil de cliente: notas internas, archivado y versión para el control de concurrencia (If-Match).
-- Los clientes no se borran: archived_at los oculta de listas, búsquedas y métricas.

ALTER TABLE customers
    ADD COLUMN notes       text,
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN version     bigint NOT NULL DEFAULT 0;

-- Listas y búsquedas excluyen a los archivados por defecto: índice parcial para el caso común.
CREATE INDEX customers_active_name_idx ON customers (organization_id, lower(name), id) WHERE archived_at IS NULL;
CREATE INDEX customers_organization_created_idx ON customers (organization_id, created_at DESC);
