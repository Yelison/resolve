import { useState, type ReactNode } from 'react'
import {
  Alert,
  Attachment,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
  Editor,
  EmptyState,
  FilterChip,
  Icon,
  IconButton,
  Input,
  Menu,
  Message,
  Metric,
  Modal,
  NavItem,
  Pagination,
  Radio,
  Select,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
  TicketRow,
  TicketTable,
  Timeline,
  Tooltip,
  Upload,
  useToast,
  type EditorMode,
  type IconName,
} from '../../components/ui'
import { iconPaths } from '../../components/ui/Icon/paths'
import { cx } from '../../lib/cx'
import { useTheme } from '../theme/useTheme'
import { demoNow, demoTickets } from './catalogData'
import styles from './CatalogPage.module.css'

const colorTokens = [
  'bg',
  'surface',
  'ink',
  'muted',
  'line',
  'brand',
  'nav',
  'blue-bg',
  'green-bg',
  'amber-bg',
  'red-bg',
  'focus',
]

const navItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/catalogo', label: 'Catálogo', icon: 'book' },
  { to: '/tickets', label: 'Tickets', icon: 'ticket' },
  { to: '/clientes', label: 'Clientes', icon: 'clients' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={`section-${title}`}>
      <h2 id={`section-${title}`} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Catálogo «Forma UI»: todos los componentes compartidos con datos de demostración, en ambos temas. */
export default function CatalogPage() {
  const { resolved, toggle } = useTheme()
  const toast = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set(['t-1047']))
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<EditorMode>('reply')

  const selection = selected.size === 0 ? 'none' : selected.size === demoTickets.length ? 'all' : 'some'
  const toggleAll = () => setSelected(selection === 'all' ? new Set() : new Set(demoTickets.map((ticket) => ticket.id)))
  const setTicketSelected = (id: string, value: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })

  const ticketTable = (
    <TicketTable label="Tickets de ejemplo" selection={selection} onToggleAll={toggleAll}>
      {demoTickets.map((ticket) => (
        <TicketRow
          key={ticket.id}
          ticket={ticket}
          to={`/tickets/${ticket.number}`}
          selected={selected.has(ticket.id)}
          onSelectedChange={(value) => setTicketSelected(ticket.id, value)}
          actions={[
            { id: 'assign', label: 'Asignar responsable', onSelect: () => {} },
            { id: 'resolve', label: 'Marcar como resuelto', onSelect: () => {} },
            { id: 'delete', label: 'Eliminar ticket', tone: 'danger', onSelect: () => setModalOpen(true) },
          ]}
        />
      ))}
    </TicketTable>
  )

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Forma UI · Catálogo de Resolve</h1>
          <p className={styles.lead}>
            Componentes compartidos construidos a partir del diseño de Figma. Los datos y las acciones son de
            demostración.
          </p>
        </div>
        <Button variant="secondary" icon={resolved === 'dark' ? 'sun' : 'moon'} onClick={toggle}>
          {resolved === 'dark' ? 'Tema claro' : 'Tema oscuro'}
        </Button>
      </header>

      <Section title="Color">
        <div className={styles.grid}>
          {colorTokens.map((token) => (
            <span key={token} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--color-${token})` }} />
              --color-{token}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Iconos">
        <div className={styles.row}>
          {(Object.keys(iconPaths) as IconName[]).map((name) => (
            <span key={name} className={styles.icon}>
              <Icon name={name} size={24} />
              {name}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Botones">
        <div className={styles.row}>
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="danger">Eliminar</Button>
          <Button disabled>Deshabilitado</Button>
          <Button loading>Enviar</Button>
          <Button icon="plus">Nuevo ticket</Button>
          <IconButton icon="bell" label="Notificaciones" />
        </div>
        <div className={styles.row}>
          <Badge tone="blue">Abierto</Badge>
          <Badge tone="green">Resuelto</Badge>
          <Badge tone="amber">En progreso</Badge>
          <Badge tone="red">Urgente</Badge>
          <Badge>Sin asignar</Badge>
          <Avatar name="Laura Méndez" size="small" />
          <Avatar name="Laura Méndez" />
          <Avatar name="Laura Méndez" size="large" />
        </div>
      </Section>

      <Section title="Formularios">
        <div className={styles.grid}>
          <Input label="Asunto" placeholder="Escribe aquí…" hint="Resume el problema en una frase." />
          <Input label="Correo" defaultValue="maria@" error="Escribe un correo válido" />
          <Input label="Deshabilitado" placeholder="Escribe aquí…" disabled />
          <Select label="Prioridad" defaultValue="">
            <option value="" disabled>
              Selecciona una opción
            </option>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
          </Select>
        </div>
        <Textarea label="Descripción" placeholder="Cuéntanos qué ocurre…" />
        <div className={styles.row}>
          <Checkbox label="Recordarme" defaultChecked />
          <Checkbox label="Parcial" indeterminate />
          <Checkbox label="Deshabilitado" disabled />
          <Radio name="catalog-channel" label="Correo" defaultChecked />
          <Radio name="catalog-channel" label="Chat" />
          <Switch label="Notificaciones" defaultChecked />
          <Switch label="Desactivado" disabled />
        </div>
        <Upload
          onFiles={(files) =>
            toast.show({ title: `${files.length} archivo(s) listos`, description: 'Demostración: no se suben.' })
          }
        />
      </Section>

      <Section title="Avisos y estados">
        <div className={styles.grid}>
          <Alert tone="blue" title="Información importante">
            Un mensaje breve para orientar al usuario.
          </Alert>
          <Alert tone="green" title="Cambios guardados">
            Tu equipo verá la actualización.
          </Alert>
          <Alert tone="amber" title="Revisa los datos">
            Falta el teléfono del cliente.
          </Alert>
          <Alert tone="red" title="No se pudo guardar">
            Inténtalo de nuevo en unos segundos.
          </Alert>
        </div>
        <div className={styles.row}>
          <Button
            variant="secondary"
            onClick={() => toast.show({ title: 'Cambios guardados', description: 'Tu equipo verá la actualización.' })}
          >
            Mostrar toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.show({
                tone: 'error',
                title: 'No se pudo enviar',
                description: 'El borrador se conserva. Reintenta.',
              })
            }
          >
            Mostrar error
          </Button>
        </div>
        <div className={styles.grid}>
          <EmptyState
            title="Todavía no hay tickets"
            description="Crea tu primera solicitud para empezar."
            headingLevel={3}
            action={<Button>Crear ticket</Button>}
          />
          <EmptyState
            kind="noResults"
            title="No encontramos resultados"
            description="Prueba otra búsqueda o elimina los filtros."
            headingLevel={3}
          />
          <EmptyState
            kind="error"
            title="No pudimos cargar los tickets"
            description="Revisa tu conexión y vuelve a intentarlo."
            headingLevel={3}
            action={<Button variant="secondary">Reintentar</Button>}
          />
          <EmptyState
            kind="restricted"
            title="No tienes acceso a esta sección"
            description="Pide al administrador que revise tus permisos."
            headingLevel={3}
          />
        </div>
        <Skeleton lines={3} />
      </Section>

      <Section title="Superposiciones">
        <div className={styles.row}>
          <Tooltip content="Tooltip junto al disparador">
            {(trigger) => (
              <Button variant="secondary" {...trigger}>
                Pasa el puntero o enfoca
              </Button>
            )}
          </Tooltip>
          <Menu
            label="Acciones de ejemplo"
            items={[
              { id: 'assign', label: 'Asignar responsable', onSelect: () => {} },
              { id: 'priority', label: 'Cambiar prioridad', onSelect: () => {}, disabled: true },
              { id: 'delete', label: 'Eliminar ticket', tone: 'danger', onSelect: () => setModalOpen(true) },
            ]}
          >
            {(trigger) => <FilterChip {...trigger}>Estado: Todos</FilterChip>}
          </Menu>
          <Button variant="danger" onClick={() => setModalOpen(true)}>
            Abrir diálogo
          </Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="¿Eliminar este ticket?"
          description="Esta acción eliminará el ticket y su historial. Demostración: no se elimina nada."
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                Eliminar
              </Button>
            </>
          }
        />
      </Section>

      <Section title="Navegación">
        <Breadcrumb items={[{ label: 'Tickets', to: '/catalogo' }, { label: '#1048 No puedo acceder a mi cuenta' }]} />
        <Tabs
          label="Vista del ticket"
          items={[
            { id: 'conversation', label: 'Conversación', content: <p>Mensajes del ticket.</p> },
            { id: 'activity', label: 'Actividad', content: <p>Historial de cambios.</p> },
            { id: 'files', label: 'Archivos', content: <p>Adjuntos del ticket.</p> },
          ]}
        />
        <Pagination page={page} pageSize={5} total={124} onPageChange={setPage} />
        <div className={styles.row}>
          <nav className={styles.nav} aria-label="Navegación expandida de ejemplo">
            {navItems.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>
          <nav className={cx(styles.nav, styles.navCollapsed)} aria-label="Navegación colapsada de ejemplo">
            {navItems.map((item) => (
              <NavItem key={item.to} {...item} collapsed />
            ))}
          </nav>
        </div>
      </Section>

      <Section title="Contenido">
        <div className={styles.grid}>
          <Metric label="Tickets abiertos" value="24" detail="8 nuevos hoy" trend="positive" />
          <Metric label="Primera respuesta" value="18 min" detail="Objetivo: 30 min" />
          <Metric label="Satisfacción" value="96 %" detail="↓ 2 % vs. ayer" trend="negative" highlighted />
        </div>
        <div className={styles.stack}>
          <Message kind="customer" author="María Pérez" sentAt={demoNow} footer="Correo electrónico">
            Hola, no puedo entrar a mi cuenta. ¿Me ayudan a recuperar el acceso?
          </Message>
          <Message kind="note" author="Laura Méndez" sentAt={demoNow}>
            Verificar la identidad antes de restablecer la contraseña.
          </Message>
        </div>
        <Timeline
          events={[
            { id: '1', kind: 'assignment', title: 'Laura tomó el ticket', at: demoNow, timeLabel: 'Hoy · 10:24' },
            { id: '2', kind: 'status', title: 'Estado: En progreso', at: demoNow, timeLabel: 'Hoy · 10:30' },
            { id: '3', kind: 'comment', title: 'Nota interna añadida', at: demoNow, timeLabel: 'Hoy · 10:32' },
          ]}
        />
        <div className={styles.grid}>
          <Attachment name="captura-error.png" size={245_760} href="/favicon.svg" />
          <Attachment name="registro-de-acceso.pdf" size={1_572_864} status="uploading" progress={64} />
          <Attachment name="video-del-fallo.mov" size={52_428_800} status="error" onRetry={() => {}} />
        </div>
        <Editor
          value={draft}
          onChange={setDraft}
          mode={mode}
          onModeChange={setMode}
          onSubmit={() => {
            toast.show({ title: 'Demostración', description: 'El envío no está conectado a un servidor.' })
            setDraft('')
          }}
          onAttach={() => {}}
        />
      </Section>

      <Section title="Tickets">
        <p className={styles.demo}>
          La tabla se adapta al ancho de su contenedor: tarjetas, columnas prioritarias o completa.
        </p>
        <div className={cx(styles.frame, styles.narrow)}>
          <p className={styles.frameLabel}>Contenedor de 380 px</p>
          {ticketTable}
        </div>
        <div className={cx(styles.frame, styles.medium)}>
          <p className={styles.frameLabel}>Contenedor de 720 px</p>
          {ticketTable}
        </div>
        <div className={styles.frame}>
          <p className={styles.frameLabel}>Ancho completo</p>
          {ticketTable}
        </div>
      </Section>
    </main>
  )
}
