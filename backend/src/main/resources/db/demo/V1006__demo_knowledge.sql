-- Base de conocimiento de demostración de Acme Studio (solo perfil dev). Mezcla estado y visibilidad para que
-- María Pérez, la clienta de la demo, vea menos que el personal: de los cuatro artículos solo dos están publicados y
-- son públicos, y la categoría «Primeros pasos» no tiene ninguno visible para ella. Los slugs son los que produce
-- Slugs.from(título) y los autores son miembros del equipo de la demostración.

INSERT INTO knowledge_categories (id, organization_id, name, slug, description, created_at) VALUES
    ('0192f000-0000-7000-8000-000000000701', '0192f000-0000-7000-8000-000000000001', 'Cuenta y acceso', 'cuenta-y-acceso',
     'Inicio de sesión, contraseñas y permisos.', '2026-09-01T09:00:00Z'),
    ('0192f000-0000-7000-8000-000000000702', '0192f000-0000-7000-8000-000000000001', 'Facturación', 'facturacion',
     'Planes, pagos y facturas.', '2026-09-01T09:00:00Z'),
    ('0192f000-0000-7000-8000-000000000703', '0192f000-0000-7000-8000-000000000001', 'Primeros pasos', 'primeros-pasos',
     'Guías para empezar a usar Resolve.', '2026-09-01T09:00:00Z');

INSERT INTO articles (id, organization_id, category_id, slug, title, body, status, visibility, allow_feedback,
                      created_by, updated_by, created_at, updated_at, published_at) VALUES
    ('0192f000-0000-7000-8000-000000000801', '0192f000-0000-7000-8000-000000000001',
     '0192f000-0000-7000-8000-000000000701', 'como-recuperar-el-acceso-a-tu-cuenta',
     'Cómo recuperar el acceso a tu cuenta',
     E'Si no puedes iniciar sesión, restablece tu contraseña en tres pasos.\n\n'
     '## Antes de empezar\n\n'
     'Ten a mano el correo con el que creaste tu cuenta: el enlace de restablecimiento solo llega a esa dirección.\n\n'
     '## Pasos\n\n'
     '1. En la pantalla de inicio de sesión, elige **¿Olvidaste tu contraseña?**\n'
     '2. Escribe tu correo y abre el mensaje que recibirás en unos minutos.\n'
     '3. Sigue el enlace, elige una contraseña nueva y vuelve a iniciar sesión.\n\n'
     '## Si el mensaje no llega\n\n'
     'Revisa la carpeta de correo no deseado. Si pasan más de diez minutos, crea un ticket desde la sección Tickets y '
     'nuestro equipo te ayudará.\n',
     'published', 'public', true,
     '0192f000-0000-7000-8000-000000000102', '0192f000-0000-7000-8000-000000000102',
     '2026-09-10T10:00:00Z', '2026-09-14T15:30:00Z', '2026-09-14T15:30:00Z'),
    ('0192f000-0000-7000-8000-000000000802', '0192f000-0000-7000-8000-000000000001',
     '0192f000-0000-7000-8000-000000000702', 'descargar-tus-facturas',
     'Descargar tus facturas',
     E'Tus facturas están siempre disponibles en PDF.\n\n'
     '## Dónde encontrarlas\n\n'
     '1. Abre **Facturación** en el menú de tu cuenta.\n'
     '2. Elige la pestaña **Historial**.\n'
     '3. Pulsa el nombre de la factura que necesitas para descargarla.\n\n'
     'Si falta alguna, escríbenos indicando el mes y el equipo la revisará.\n',
     'published', 'public', true,
     '0192f000-0000-7000-8000-000000000103', '0192f000-0000-7000-8000-000000000103',
     '2026-09-12T09:00:00Z', '2026-09-12T09:00:00Z', '2026-09-12T09:00:00Z'),
    ('0192f000-0000-7000-8000-000000000803', '0192f000-0000-7000-8000-000000000001',
     '0192f000-0000-7000-8000-000000000702', 'guia-interna-de-reembolsos',
     'Guía interna de reembolsos',
     E'Documento solo para el equipo.\n\n'
     '## Cuándo reembolsar\n\n'
     'Un reembolso necesita la aprobación de un **administrador** cuando supera el importe de un mes de plan.\n\n'
     '## Cómo registrarlo\n\n'
     '1. Anota el motivo en el ticket como nota interna.\n'
     '2. Pide la aprobación al administrador de guardia.\n'
     '3. Responde al cliente con el plazo de devolución.\n',
     'published', 'internal', false,
     '0192f000-0000-7000-8000-000000000101', '0192f000-0000-7000-8000-000000000101',
     '2026-09-15T11:00:00Z', '2026-09-20T08:45:00Z', '2026-09-20T08:45:00Z'),
    ('0192f000-0000-7000-8000-000000000804', '0192f000-0000-7000-8000-000000000001',
     '0192f000-0000-7000-8000-000000000703', 'primeros-pasos-con-resolve',
     'Primeros pasos con Resolve',
     E'Borrador pendiente de revisión.\n\n'
     '## Qué puedes hacer\n\n'
     '- Crear un ticket y seguir su conversación.\n'
     '- Consultar la base de conocimiento antes de escribirnos.\n'
     '- Revisar el estado de tus solicitudes.\n',
     'draft', 'public', true,
     '0192f000-0000-7000-8000-000000000102', '0192f000-0000-7000-8000-000000000102',
     '2026-09-22T16:00:00Z', '2026-09-22T16:00:00Z', NULL);
