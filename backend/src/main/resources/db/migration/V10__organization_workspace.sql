-- Espacios (docs/decisions/0004-workspaces.md, fases 2 y 3): el color con el que se distingue cada organización, quién la
-- creó (para el límite de tres por persona) y cuándo se completó «Primeros pasos».

-- El color de una organización sale de su id: la clave número `byte final mod 8` de la lista. Es el último byte y no un
-- prefijo porque los ids son UUIDv7 y los primeros bytes son la marca de tiempo (todos los espacios creados el mismo día
-- tendrían el mismo color); el último es aleatorio. Java hace lo mismo con los 3 bits bajos del id
-- (`OrganizationColors.forId`) y un test comprueba que las dos funciones coinciden. El orden de las claves es parte del
-- contrato: cambiarlo cambiaría el color de todos los espacios que no eligieron uno.
CREATE FUNCTION organization_color(organization_id uuid) RETURNS varchar
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    RETURN (ARRAY['blue', 'green', 'magenta', 'orange', 'violet', 'teal', 'brick', 'slate'])
        [get_byte(uuid_send(organization_id), 15) % 8 + 1];

ALTER TABLE organizations
    ADD COLUMN color                   varchar(16),
    ADD COLUMN created_by              uuid REFERENCES users (id),
    ADD COLUMN getting_started_done_at timestamptz;

-- Las organizaciones que ya existen reciben el color de su id y no muestran «Primeros pasos»; `created_by` queda
-- `NULL`: no cuentan para el límite de nadie.
UPDATE organizations SET color = organization_color(id), getting_started_done_at = now();

ALTER TABLE organizations
    ALTER COLUMN color SET NOT NULL,
    ADD CONSTRAINT organizations_color_check
        CHECK (color IN ('blue', 'green', 'magenta', 'orange', 'violet', 'teal', 'brick', 'slate'));

-- El recuento del límite (`created_by = persona`); casi todas las filas lo tienen nulo y no hace falta indexarlas.
CREATE INDEX organizations_created_by_idx ON organizations (created_by) WHERE created_by IS NOT NULL;

-- Una organización insertada sin color (las migraciones de demostración ya aplicadas, que no se pueden editar, y los
-- datos de prueba) recibe el de su id: así nunca hay un color distinto del que calcularía Java. La columna sigue siendo
-- NOT NULL: PostgreSQL comprueba esa restricción después de los disparadores BEFORE.
CREATE FUNCTION organizations_default_color() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF NEW.color IS NULL THEN
        NEW.color := organization_color(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_default_color
    BEFORE INSERT ON organizations
    FOR EACH ROW EXECUTE FUNCTION organizations_default_color();
