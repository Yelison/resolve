-- Estado de las membresías: una invitación es una membresía `invited` ligada al correo que se activa en el primer
-- acceso; retirar a alguien la marca `removed` sin borrarla, para conservar el historial que la referencia.

ALTER TABLE memberships
    ADD COLUMN status     varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'removed')),
    ADD COLUMN invited_at timestamptz,
    ADD COLUMN joined_at  timestamptz,
    ADD COLUMN removed_at timestamptz;

UPDATE memberships SET joined_at = created_at;

CREATE INDEX memberships_organization_status_idx ON memberships (organization_id, status);
