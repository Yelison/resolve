import { Link, useParams } from 'react-router'
import {
  Alert,
  Button,
  buttonClassName,
  EmptyState,
  Select,
  Skeleton,
  Tabs,
  ticketPriority,
  ticketStatus,
  Timeline,
} from '../../components/ui'
import { isApiError } from '../../api/client'
import type { Ticket, TicketChannel } from '../../domain/ticket'
import { ticketPriorityValues, ticketStatusValues } from '../../domain/ticket'
import { formatDateTime } from '../../lib/format'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
import { useTimeZone } from '../session/useTimeZone'
import { useAssignees } from '../team/queries'
import { toTimelineEvent } from './activityText'
import { Conversation } from './Conversation'
import { useTicketChange } from './useTicketChange'
import { useTicket, useTicketActivity, type TicketChanges } from './queries'
import styles from './TicketDetailPage.module.css'

const channelLabels: Record<TicketChannel, string> = {
  email: 'correo electrónico',
  chat: 'chat',
  phone: 'teléfono',
  web: 'web',
}

export function TicketDetailPage() {
  const number = Number(useParams().number)
  const ticket = useTicket(number)
  const me = useMe()

  // Sin conocer el rol no se pinta nada: evita mostrar un instante la vista de otro rol.
  if (ticket.isPending || me.isPending) {
    return (
      <div className={pageStyles.page}>
        <Skeleton lines={2} label="Cargando ticket…" />
        <Skeleton lines={4} label="" />
      </div>
    )
  }
  if (ticket.isError) {
    const missing = isApiError(ticket.error, 404) || isApiError(ticket.error, 400)
    return (
      <div className={pageStyles.page}>
        <PageHeader title={missing ? 'Ticket no encontrado' : 'No pudimos cargar el ticket'} />
        <EmptyState
          kind={missing ? 'noResults' : 'error'}
          title={missing ? `No existe el ticket #${number}` : 'Revisa tu conexión'}
          description={missing ? 'Puede que el número sea incorrecto o que no tengas acceso.' : 'Vuelve a intentarlo.'}
          action={
            missing ? (
              <Link to="/tickets" className={buttonClassName({ variant: 'secondary' })}>
                Volver a tickets
              </Link>
            ) : (
              <Button variant="secondary" onClick={() => void ticket.refetch()}>
                Reintentar
              </Button>
            )
          }
        />
      </div>
    )
  }
  // La clave reinicia el borrador, el modo del editor y los errores al pasar de un ticket a otro.
  return <TicketDetail key={ticket.data.number} ticket={ticket.data} />
}

function TicketDetail({ ticket }: { ticket: Ticket }) {
  const me = useMe()
  const isStaff = me.data ? me.data.role !== 'customer' : false
  const timeZone = useTimeZone()
  const { change, update, submission, conflict } = useTicketChange(ticket)

  const resolved = ticket.status === 'resolved'
  const created = formatDateTime(new Date(ticket.createdAt), undefined, timeZone).replace(/^(Hoy|Ayer)/, (day) =>
    day.toLowerCase(),
  )

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={ticket.subject}
        description={`#${ticket.number} · Creado ${created} · Canal: ${channelLabels[ticket.channel]}`}
        actions={
          isStaff && (
            <Button
              variant={resolved ? 'secondary' : 'primary'}
              loading={update.isPending}
              loadingLabel="Guardando…"
              onClick={() =>
                change(
                  { status: resolved ? 'open' : 'resolved' },
                  resolved ? `Ticket #${ticket.number} reabierto` : `Ticket #${ticket.number} resuelto`,
                )
              }
            >
              {resolved ? 'Reabrir ticket' : 'Resolver ticket'}
            </Button>
          )
        }
      />

      {conflict && (
        <Alert tone="amber" title="El ticket cambió mientras lo editabas" live>
          Otra persona lo actualizó. Ya cargamos la versión actual: revisa los datos y repite el cambio si sigue
          haciendo falta.
        </Alert>
      )}

      <LockTimeoutAlert
        error={update.error}
        pending={update.isPending}
        onRetry={submission.retry}
        what="guardar el cambio del ticket"
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          {isStaff ? (
            <Tabs
              label="Vista del ticket"
              items={[
                {
                  id: 'conversation',
                  label: 'Conversación',
                  content: <Conversation ticket={ticket} isStaff className={styles.spaced} />,
                },
                { id: 'history', label: 'Historial', content: <History number={ticket.number} /> },
              ]}
            />
          ) : (
            <Conversation ticket={ticket} isStaff={false} className={styles.spaced} />
          )}
        </div>

        <aside className={styles.aside} aria-labelledby="ticket-info-title">
          <h2 id="ticket-info-title" className={styles.asideTitle}>
            Información del ticket
          </h2>
          {isStaff ? (
            <TicketFields ticket={ticket} saving={update.isPending} onChange={change} />
          ) : (
            <ReadOnlyFields ticket={ticket} />
          )}
        </aside>
      </div>
    </div>
  )
}

function TicketFields({
  ticket,
  saving,
  onChange,
}: {
  ticket: Ticket
  /** Se está guardando un cambio: los campos siguen en su sitio (con el foco) pero no aceptan otro. */
  saving: boolean
  onChange: (changes: TicketChanges, success: string) => void
}) {
  const assignees = useAssignees()
  return (
    <div className={styles.fields}>
      <Select
        label="Estado"
        value={ticket.status}
        aria-disabled={saving || undefined}
        onChange={(event) => {
          const status = event.target.value as Ticket['status']
          onChange({ status }, `Estado: ${ticketStatus[status].label}`)
        }}
      >
        {ticketStatusValues.map((status) => (
          <option key={status} value={status}>
            {ticketStatus[status].label}
          </option>
        ))}
      </Select>
      <Select
        label="Prioridad"
        value={ticket.priority}
        aria-disabled={saving || undefined}
        onChange={(event) => {
          const priority = event.target.value as Ticket['priority']
          onChange({ priority }, `Prioridad: ${ticketPriority[priority].label}`)
        }}
      >
        {ticketPriorityValues.map((priority) => (
          <option key={priority} value={priority}>
            {ticketPriority[priority].label}
          </option>
        ))}
      </Select>
      <Select
        label="Responsable"
        value={ticket.assignee?.id ?? ''}
        disabled={assignees.isPending}
        aria-disabled={saving || undefined}
        onChange={(event) => {
          const assigneeId = event.target.value || null
          const name = assignees.data?.find((member) => member.id === assigneeId)?.name
          onChange({ assigneeId }, name ? `Asignado a ${name}` : 'Ticket sin responsable')
        }}
      >
        <option value="">Sin asignar</option>
        {/* El responsable actual se muestra aunque la lista aún no haya cargado. */}
        {ticket.assignee && !assignees.data?.some((member) => member.id === ticket.assignee?.id) && (
          <option value={ticket.assignee.id}>{ticket.assignee.name}</option>
        )}
        {assignees.data?.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </Select>
      <CustomerSummary ticket={ticket} />
    </div>
  )
}

function ReadOnlyFields({ ticket }: { ticket: Ticket }) {
  return (
    <dl className={styles.fields}>
      <div className={styles.customer}>
        <dt className={styles.customerLabel}>Estado</dt>
        <dd className={styles.customerValue}>{ticketStatus[ticket.status].label}</dd>
      </div>
      <div className={styles.customer}>
        <dt className={styles.customerLabel}>Responsable</dt>
        <dd className={styles.customerValue}>{ticket.assignee?.name ?? 'Sin asignar'}</dd>
      </div>
    </dl>
  )
}

function CustomerSummary({ ticket }: { ticket: Ticket }) {
  return (
    <div className={styles.customer}>
      <span className={styles.customerLabel}>Cliente</span>
      <span className={styles.customerValue}>{ticket.customer.name}</span>
      <span className={styles.customerMeta}>
        {[ticket.customer.email, ticket.customer.company].filter(Boolean).join(' · ')}
      </span>
    </div>
  )
}

function History({ number }: { number: number }) {
  const activity = useTicketActivity(number)
  const timeZone = useTimeZone()
  if (activity.isPending) return <Skeleton lines={3} label="Cargando historial…" />
  if (activity.isError) {
    return (
      <EmptyState
        kind="error"
        headingLevel={3}
        title="No pudimos cargar el historial"
        action={
          <Button variant="secondary" onClick={() => void activity.refetch()}>
            Reintentar
          </Button>
        }
      />
    )
  }
  return (
    <div className={styles.history}>
      <Timeline events={activity.data.map((entry) => toTimelineEvent(entry, undefined, timeZone))} />
    </div>
  )
}
