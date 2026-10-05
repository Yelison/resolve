-- Base de conocimiento de demostración de Acme Studio (solo perfil dev), con las categorías y los artículos del
-- diseño «Base de conocimiento». Tres artículos están publicados y son públicos; «Configurar notificaciones» es un
-- borrador, así que María Pérez, la clienta de la demo, ve tres de los cuatro y el personal los cuatro. Los slugs son
-- los que produce Slugs.from(título) y los autores son miembros del equipo de la demostración.

INSERT INTO knowledge_categories (id, organization_id, name, slug, description, created_at) VALUES
    ('0192f000-0000-7000-8000-000000000701', '0192f000-0000-7000-8000-000000000001', 'Primeros pasos', 'primeros-pasos',
     'Configura tu espacio', '2026-09-01T09:00:00Z'),
    ('0192f000-0000-7000-8000-000000000702', '0192f000-0000-7000-8000-000000000001', 'Cuenta y acceso', 'cuenta-y-acceso',
     'Usuarios y seguridad', '2026-09-01T09:00:00Z'),
    ('0192f000-0000-7000-8000-000000000703', '0192f000-0000-7000-8000-000000000001', 'Facturación', 'facturacion',
     'Planes y pagos', '2026-09-01T09:00:00Z');

INSERT INTO articles (id, organization_id, category_id, slug, title, body, status, visibility, allow_feedback,
                      created_by, updated_by, created_at, updated_at, published_at) VALUES
    ('0192f000-0000-7000-8000-000000000801', '0192f000-0000-7000-8000-000000000001',
     '0192f000-0000-7000-8000-000000000702', 'como-recuperar-el-acceso-a-tu-cuenta',
     'Cómo recuperar el acceso a tu cuenta',
     E'Si no puedes iniciar sesión, solicita un nuevo enlace de recuperación desde la pantalla de acceso.\n\n'
     '## 1. Solicita un enlace nuevo\n\n'
     'Selecciona «Olvidé mi contraseña» e introduce el correo asociado a tu cuenta.\n\n'
     '## 2. Revisa tu correo\n\n'
     'Busca el mensaje de recuperación. Si no aparece, revisa la carpeta de spam.\n\n'
     '## 3. Recupera el acceso\n\n'
     'Abre el enlace antes de que venza y sigue las instrucciones. Si el problema continúa, crea un ticket.\n',
     'published', 'public', true,
     '0192f000-0000-7000-8000-000000000102', '0192f000-0000-7000-8000-000000000102',
     '2026-09-28T10:00:00Z', '2026-10-05T09:00:00Z', '2026-10-05T09:00:00Z'),
    ('0192f000-0000-7000-8000-000000000802', '0192f000-0000-7000-8000-000000000001',
     '0192f000-0000-7000-8000-000000000701', 'invitar-a-tu-equipo',
     'Invitar a tu equipo',
     E'Trabajar en equipo es más fácil cuando todas las personas tienen su propio acceso.\n\n'
     '## Antes de invitar\n\n'
     'Solo las personas con rol de administrador pueden invitar. Ten a mano el correo de cada persona.\n\n'
     '## Cómo invitar\n\n'
     '1. Abre la sección **Equipo**.\n'
     '2. Pulsa **Invitar** y escribe el correo y el rol.\n'
     '3. La persona accede iniciando sesión con ese correo.\n',
     'published', 'public', true,
     '0192f000-0000-7000-8000-000000000101', '0192f000-0000-7000-8000-000000000101',
     '2026-09-30T11:00:00Z', '2026-10-04T10:30:00Z', '2026-10-04T10:30:00Z'),
    ('0192f000-0000-7000-8000-000000000803', '0192f000-0000-7000-8000-000000000001',
     '0192f000-0000-7000-8000-000000000703', 'descargar-una-factura',
     'Descargar una factura',
     E'Tus facturas están disponibles en PDF en cuanto se emiten.\n\n'
     '## Dónde encontrarlas\n\n'
     '1. Abre **Facturación** en el menú de tu cuenta.\n'
     '2. Elige la pestaña **Historial**.\n'
     '3. Pulsa la factura que necesitas para descargarla.\n\n'
     'Si falta alguna, escríbenos indicando el mes y la revisaremos.\n',
     'published', 'public', true,
     '0192f000-0000-7000-8000-000000000103', '0192f000-0000-7000-8000-000000000103',
     '2026-09-25T09:00:00Z', '2026-10-02T09:00:00Z', '2026-10-02T09:00:00Z'),
    ('0192f000-0000-7000-8000-000000000804', '0192f000-0000-7000-8000-000000000001',
     '0192f000-0000-7000-8000-000000000701', 'configurar-notificaciones',
     'Configurar notificaciones',
     E'Elige cómo y cuándo quieres enterarte de la actividad de tus tickets.\n\n'
     '## Qué puedes ajustar\n\n'
     '- Los avisos de respuestas nuevas en tus tickets.\n'
     '- El resumen diario de actividad.\n'
     '- Los avisos de tickets que se te asignan.\n',
     'draft', 'public', true,
     '0192f000-0000-7000-8000-000000000102', '0192f000-0000-7000-8000-000000000102',
     '2026-10-01T16:00:00Z', '2026-10-01T16:00:00Z', NULL);
