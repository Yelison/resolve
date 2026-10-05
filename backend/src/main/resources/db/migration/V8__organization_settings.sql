-- Ajustes de la organización: correo de soporte y versión para el control de concurrencia (If-Match).
-- El contador next_ticket_number se actualiza con SQL nativo y no toca version: crear tickets no invalida
-- una edición de los ajustes en curso.

ALTER TABLE organizations
    ADD COLUMN support_email varchar(254),
    ADD COLUMN version       bigint NOT NULL DEFAULT 0;
