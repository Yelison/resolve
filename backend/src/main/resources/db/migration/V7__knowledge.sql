-- Base de conocimiento: categorías y artículos en Markdown. Toda referencia exige la misma organización mediante
-- claves compuestas; el cuerpo se guarda como texto Markdown y la API no lo interpreta.

CREATE TABLE knowledge_categories (
    id              uuid PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES organizations (id),
    name            varchar(80)  NOT NULL,
    slug            varchar(80)  NOT NULL,
    description     varchar(160),
    created_at      timestamptz  NOT NULL,
    UNIQUE (organization_id, id),
    CONSTRAINT knowledge_categories_organization_slug_key UNIQUE (organization_id, slug)
);

CREATE TABLE articles (
    id              uuid PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES organizations (id),
    category_id     uuid         NOT NULL,
    slug            varchar(120) NOT NULL,
    title           varchar(160) NOT NULL,
    body            text         NOT NULL,
    status          varchar(16)  NOT NULL CHECK (status IN ('draft', 'published')),
    visibility      varchar(16)  NOT NULL CHECK (visibility IN ('internal', 'public')),
    allow_feedback  boolean      NOT NULL DEFAULT true,
    version         bigint       NOT NULL DEFAULT 0,
    created_by      uuid         NOT NULL REFERENCES users (id),
    updated_by      uuid         NOT NULL REFERENCES users (id),
    created_at      timestamptz  NOT NULL,
    updated_at      timestamptz  NOT NULL,
    published_at    timestamptz,
    UNIQUE (organization_id, id),
    -- Red de seguridad del slug: el servicio serializa las altas de una organización, pero la unicidad no depende de ello.
    CONSTRAINT articles_organization_slug_key UNIQUE (organization_id, slug),
    FOREIGN KEY (organization_id, category_id) REFERENCES knowledge_categories (organization_id, id)
);

CREATE INDEX articles_list_idx ON articles (organization_id, status, updated_at DESC, id DESC);
CREATE INDEX articles_category_idx ON articles (organization_id, category_id);
