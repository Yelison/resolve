-- Una persona de demostración sin ninguna membresía, para ver lo que pasa al entrar sin espacio (docs/decisions/0004-workspaces.md,
-- fase 4a): con X-Demo-User: nueva.persona@demo.example la API responde el 401 «no-membership» y, con el alta abierta
-- (RESOLVE_ORGANIZATIONS_CREATION=open), le deja crear su primer espacio. Solo la cuenta: sin membresías, ni siquiera retiradas
-- (una retirada sería «access-deactivated», que es otro caso). Las migraciones de demostración ya aplicadas no se tocan.

INSERT INTO users (id, name, email) VALUES
    ('0192f000-0000-7000-8000-000000000108', 'Nueva Persona', 'nueva.persona@demo.example');
