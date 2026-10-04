-- Tickets, conversación y actividad. Toda referencia exige la misma organización mediante claves compuestas.

CREATE TABLE tickets (
    id                uuid PRIMARY KEY,
    organization_id   uuid         NOT NULL REFERENCES organizations (id),
    number            bigint       NOT NULL CHECK (number > 0),
    subject           varchar(160) NOT NULL,
    description       text         NOT NULL,
    status            varchar(16)  NOT NULL CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved')),
    priority          varchar(16)  NOT NULL CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
    channel           varchar(16)  NOT NULL CHECK (channel IN ('email', 'chat', 'phone', 'web')),
    customer_id       uuid         NOT NULL,
    assignee_id       uuid,
    first_response_at timestamptz,
    version           bigint       NOT NULL DEFAULT 0,
    created_at        timestamptz  NOT NULL,
    updated_at        timestamptz  NOT NULL,
    UNIQUE (organization_id, number),
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id),
    -- El responsable debe ser miembro de la misma organización; el servicio exige además rol admin o agent.
    FOREIGN KEY (organization_id, assignee_id) REFERENCES memberships (organization_id, user_id)
);

CREATE INDEX tickets_inbox_idx ON tickets (organization_id, updated_at DESC, number DESC);
CREATE INDEX tickets_status_idx ON tickets (organization_id, status);
CREATE INDEX tickets_assignee_idx ON tickets (organization_id, assignee_id);
CREATE INDEX tickets_customer_idx ON tickets (organization_id, customer_id);

CREATE TABLE ticket_messages (
    id                 uuid PRIMARY KEY,
    organization_id    uuid        NOT NULL,
    ticket_id          uuid        NOT NULL,
    visibility         varchar(16) NOT NULL CHECK (visibility IN ('public', 'internal')),
    author_kind        varchar(16) NOT NULL CHECK (author_kind IN ('agent', 'customer')),
    author_user_id     uuid REFERENCES users (id),
    author_customer_id uuid,
    body               text        NOT NULL,
    created_at         timestamptz NOT NULL,
    FOREIGN KEY (organization_id, ticket_id) REFERENCES tickets (organization_id, id),
    FOREIGN KEY (organization_id, author_customer_id) REFERENCES customers (organization_id, id),
    CHECK ((author_kind = 'agent' AND author_user_id IS NOT NULL AND author_customer_id IS NULL)
        OR (author_kind = 'customer' AND author_customer_id IS NOT NULL AND author_user_id IS NULL)),
    -- Los clientes no escriben notas internas.
    CHECK (author_kind = 'agent' OR visibility = 'public')
);

CREATE INDEX ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at, id);

CREATE TABLE ticket_activities (
    id                 uuid PRIMARY KEY,
    organization_id    uuid         NOT NULL,
    ticket_id          uuid         NOT NULL,
    type               varchar(24)  NOT NULL
        CHECK (type IN ('created', 'status_changed', 'priority_changed', 'assignee_changed')),
    actor_user_id      uuid         NOT NULL REFERENCES users (id),
    actor_name         varchar(120) NOT NULL,
    from_value         varchar(16),
    to_value           varchar(16),
    from_assignee_id   uuid,
    from_assignee_name varchar(120),
    to_assignee_id     uuid,
    to_assignee_name   varchar(120),
    created_at         timestamptz  NOT NULL,
    FOREIGN KEY (organization_id, ticket_id) REFERENCES tickets (organization_id, id)
);

CREATE INDEX ticket_activities_ticket_idx ON ticket_activities (ticket_id, created_at DESC, id DESC);
CREATE INDEX ticket_activities_resolved_idx ON ticket_activities (organization_id, created_at)
    WHERE type = 'status_changed' AND to_value = 'resolved';
