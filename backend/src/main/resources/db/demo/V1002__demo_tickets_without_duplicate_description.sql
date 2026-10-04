-- La descripción del ticket ya se muestra sobre la conversación; la siembra V1001 la repetía como primer mensaje del
-- cliente. Las migraciones aplicadas no se editan, así que se corrige con una nueva (solo perfil dev).
DELETE FROM ticket_messages m
USING tickets t
WHERE m.ticket_id = t.id AND m.author_kind = 'customer' AND m.body = t.description;
