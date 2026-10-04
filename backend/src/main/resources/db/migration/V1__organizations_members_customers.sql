-- Organizaciones, usuarios, membresías y clientes.
-- Las claves compuestas (organization_id, id) permiten que las tablas hijas exijan, en la propia base
-- de datos, que sus referencias pertenezcan a la misma organización.

CREATE TABLE organizations (
    id                            uuid PRIMARY KEY,
    name                          varchar(120) NOT NULL,
    time_zone                     varchar(64)  NOT NULL,
    first_response_target_minutes integer      NOT NULL DEFAULT 30 CHECK (first_response_target_minutes > 0),
    next_ticket_number            bigint       NOT NULL DEFAULT 1 CHECK (next_ticket_number > 0),
    created_at                    timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id         uuid PRIMARY KEY,
    name       varchar(120) NOT NULL,
    email      varchar(254) NOT NULL,
    created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE customers (
    id              uuid PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES organizations (id),
    name            varchar(120) NOT NULL,
    email           varchar(254) NOT NULL,
    company         varchar(120),
    created_at      timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX customers_organization_email_key ON customers (organization_id, lower(email));
CREATE INDEX customers_organization_name_idx ON customers (organization_id, lower(name), id);

CREATE TABLE memberships (
    id              uuid PRIMARY KEY,
    organization_id uuid        NOT NULL REFERENCES organizations (id),
    user_id         uuid        NOT NULL REFERENCES users (id),
    role            varchar(16) NOT NULL CHECK (role IN ('admin', 'agent', 'customer')),
    customer_id     uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id),
    FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id),
    -- Solo los clientes enlazan un registro de cliente, y siempre lo hacen.
    CHECK ((role = 'customer') = (customer_id IS NOT NULL))
);

CREATE INDEX memberships_user_idx ON memberships (user_id);
