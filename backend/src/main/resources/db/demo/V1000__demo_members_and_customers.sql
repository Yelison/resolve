-- Datos de demostración (solo perfil dev). Ids fijos para que las relaciones se lean con claridad.

INSERT INTO organizations (id, name, time_zone) VALUES
    ('0192f000-0000-7000-8000-000000000001', 'Acme Studio', 'America/Bogota'),
    ('0192f000-0000-7000-8000-000000000002', 'Northwind Soporte', 'Europe/Madrid');

INSERT INTO users (id, name, email) VALUES
    ('0192f000-0000-7000-8000-000000000101', 'Yelisson Ortiz', 'yelisson.ortiz@acme.example'),
    ('0192f000-0000-7000-8000-000000000102', 'Laura Méndez', 'laura.mendez@acme.example'),
    ('0192f000-0000-7000-8000-000000000103', 'Daniel Santos', 'daniel.santos@acme.example'),
    ('0192f000-0000-7000-8000-000000000104', 'Sofía Torres', 'sofia.torres@acme.example'),
    ('0192f000-0000-7000-8000-000000000105', 'María Pérez', 'maria.perez@cliente.example'),
    ('0192f000-0000-7000-8000-000000000201', 'Jordi Puig', 'jordi.puig@northwind.example');

INSERT INTO customers (id, organization_id, name, email, company) VALUES
    ('0192f000-0000-7000-8000-000000000301', '0192f000-0000-7000-8000-000000000001', 'María Pérez', 'maria.perez@cliente.example', 'Acme Studio'),
    ('0192f000-0000-7000-8000-000000000302', '0192f000-0000-7000-8000-000000000001', 'Carlos Ruiz', 'carlos.ruiz@northstar.example', 'Northstar'),
    ('0192f000-0000-7000-8000-000000000303', '0192f000-0000-7000-8000-000000000001', 'Ana García', 'ana.garcia@acme-studio.example', 'Acme Studio'),
    ('0192f000-0000-7000-8000-000000000304', '0192f000-0000-7000-8000-000000000001', 'Luis Gómez', 'luis.gomez@orbitlabs.example', 'Orbit Labs'),
    ('0192f000-0000-7000-8000-000000000305', '0192f000-0000-7000-8000-000000000001', 'Elena Díaz', 'elena.diaz@northstar.example', 'Northstar'),
    ('0192f000-0000-7000-8000-000000000401', '0192f000-0000-7000-8000-000000000002', 'Marta Soler', 'marta.soler@cliente-nw.example', 'Soler Arquitectes');

INSERT INTO memberships (id, organization_id, user_id, role, customer_id) VALUES
    ('0192f000-0000-7000-8000-000000000501', '0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000101', 'admin', NULL),
    ('0192f000-0000-7000-8000-000000000502', '0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000102', 'agent', NULL),
    ('0192f000-0000-7000-8000-000000000503', '0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000103', 'agent', NULL),
    ('0192f000-0000-7000-8000-000000000504', '0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000104', 'agent', NULL),
    ('0192f000-0000-7000-8000-000000000505', '0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000105', 'customer', '0192f000-0000-7000-8000-000000000301'),
    ('0192f000-0000-7000-8000-000000000601', '0192f000-0000-7000-8000-000000000002', '0192f000-0000-7000-8000-000000000201', 'agent', NULL);
