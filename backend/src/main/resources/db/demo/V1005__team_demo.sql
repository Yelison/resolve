-- Equipo de demostración con los otros dos estados (solo perfil dev): una invitación pendiente y una persona
-- retirada, para ver la lista de Equipo y su filtro «Retirados» sin tener que invitar ni retirar a nadie antes.

INSERT INTO users (id, name, email) VALUES
    ('0192f000-0000-7000-8000-000000000106', 'Andrés Vega', 'andres.vega@acme.example'),
    ('0192f000-0000-7000-8000-000000000107', 'Pablo Núñez', 'pablo.nunez@acme.example');

INSERT INTO memberships (id, organization_id, user_id, role, customer_id, status, invited_at, joined_at, removed_at) VALUES
    ('0192f000-0000-7000-8000-000000000506', '0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000106', 'agent', NULL, 'invited', now() - interval '2 days', NULL, NULL),
    ('0192f000-0000-7000-8000-000000000507', '0192f000-0000-7000-8000-000000000001', '0192f000-0000-7000-8000-000000000107', 'agent', NULL, 'removed', now() - interval '60 days', now() - interval '55 days', now() - interval '10 days');
