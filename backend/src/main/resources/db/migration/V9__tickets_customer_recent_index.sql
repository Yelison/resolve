-- La lista de clientes muestra el ticket más reciente de cada uno de la página (`DISTINCT ON (customer_id)` ordenado por
-- `updated_at DESC, number DESC`). Con este índice cada cliente se resuelve leyendo la primera entrada de su rango, sin
-- ordenar todos sus tickets. Cubre también todo lo que hacía `tickets_customer_idx` (organization_id, customer_id), que
-- por eso se elimina: sería un índice redundante que cada escritura de tickets tendría que mantener.

CREATE INDEX tickets_customer_recent_idx ON tickets (organization_id, customer_id, updated_at DESC, number DESC);

DROP INDEX tickets_customer_idx;
