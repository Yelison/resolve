-- La empresa de dos clientes de demostración se llamaba como el espacio de trabajo («Acme Studio»), y parecía que el
-- espacio fuera cliente de sí mismo. V1000, V1001 y V1003 ya están aplicados y no se editan: esta migración corrige esas
-- filas (solo perfil dev). Solo toca la organización de demostración de Acme Studio.
UPDATE customers
SET company = 'Lumen Diseño'
WHERE organization_id = '0192f000-0000-7000-8000-000000000001' AND company = 'Acme Studio';

UPDATE customers
SET email = 'ana.garcia@lumen-diseno.example'
WHERE id = '0192f000-0000-7000-8000-000000000303' AND email = 'ana.garcia@acme-studio.example';

UPDATE customers
SET notes = replace(notes, 'cuenta de Acme Studio', 'cuenta de Lumen Diseño')
WHERE id = '0192f000-0000-7000-8000-000000000301';

-- El ticket de Ana pide que las facturas lleguen al correo de su empresa.
UPDATE tickets
SET description = replace(description, 'acme-studio.example', 'lumen-diseno.example')
WHERE organization_id = '0192f000-0000-7000-8000-000000000001' AND description LIKE '%acme-studio.example%';

UPDATE ticket_messages
SET body = replace(body, 'acme-studio.example', 'lumen-diseno.example')
WHERE organization_id = '0192f000-0000-7000-8000-000000000001' AND body LIKE '%acme-studio.example%';
