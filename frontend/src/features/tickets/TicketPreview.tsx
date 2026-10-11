import { Link } from 'react-router'
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  EmptyState,
  Select,
  Skeleton,
  skeletonBarClassName,
  ticketStatus,
  type SelectProps,
} from '../../components/ui'
import { isApiError } from '../../api/client'
import type { Ticket } from '../../domain/ticket'
import { ticketStatusValues } from '../../domain/ticket'
import { cx } from '../../lib/cx'
import { formatRelative } from '../../lib/format'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { useTimeZone } from '../session/useTimeZone'
import { useAssignees } from '../team/queries'
import { Conversation } from './Conversation'
import { customerStatusLabels, firstName } from './inboxText'
import { useTicket } from './queries'
import { useTicketChange } from './useTicketChange'
import styles from './TicketPreview.module.css'

export interface TicketPreviewProps {
  number: number
  isStaff: boolean
  /** Quita la selección (por ejemplo, si el ticket ya no existe). */
  onClear: () => void
}

/**
 * Vista previa del ticket seleccionado, a la derecha de la lista: cabecera con estado y responsable editables,
 * conversación y compositor. Es lo mismo que el detalle, sin salir de la bandeja; «Abrir completo» lleva al detalle.
 */
export function TicketPreview({ number, isStaff, onClear }: TicketPreviewProps) {
  const ticket = useTicket(number)
  if (ticket.isPending) return <TicketPreviewSkeleton isStaff={isStaff} />
  if (ticket.isError) {
    if (isApiError(ticket.error, 404) || isApiError(ticket.error, 400)) {
      return (
        <div className={styles.state}>
          <EmptyState
            kind="noResults"
            headingLevel={2}
            title={`No existe el ticket #${number}`}
            description="Puede que el número sea incorrecto o que no tengas acceso."
            action={
              <Button variant="secondary" onClick={onClear}>
                Quitar la selección
              </Button>
            }
          />
        </div>
      )
    }
    if (isApiError(ticket.error, 403)) {
      return (
        <div className={styles.state}>
          <EmptyState
            kind="restricted"
            headingLevel={2}
            title="No tienes permiso para ver este ticket"
            description="Pide acceso a un administrador de tu organización."
          />
        </div>
      )
    }
    return (
      <div className={styles.state}>
        <EmptyState
          kind="error"
          headingLevel={2}
          title="No pudimos cargar el ticket"
          description="Revisa tu conexión y vuelve a intentarlo."
          live={ticket.failureCount > 1}
          action={
            <Button
              variant="secondary"
              aria-label={`Reintentar cargar el ticket #${number}`}
              onClick={() => void ticket.refetch()}
            >
              Reintentar
            </Button>
          }
        />
      </div>
    )
  }
  // La clave reinicia el borrador, el modo del editor y los errores al pasar de un ticket a otro.
  return <PreviewBody key={ticket.data.number} ticket={ticket.data} isStaff={isStaff} />
}

function PreviewBody({ ticket, isStaff }: { ticket: Ticket; isStaff: boolean }) {
  const timeZone = useTimeZone()
  const { change, update, submission, conflict } = useTicketChange(ticket)
  const created = formatRelative(new Date(ticket.createdAt), undefined, timeZone)
  const status = ticketStatus[ticket.status]
  const context = isStaff
    ? [`#${ticket.number}`, ticket.customer.name, ticket.customer.company].filter(Boolean).join(' · ')
    : `#${ticket.number} · creada ${created}${ticket.assignee ? ` · te atiende ${ticket.assignee.name}` : ''}`

  return (
    <>
      <header className={styles.header}>
        <div className={styles.titles}>
          <p className={styles.context}>{context}</p>
          <h2 className={styles.title}>{ticket.subject}</h2>
        </div>
        <div className={styles.controls}>
          {isStaff ? (
            <TicketControls ticket={ticket} saving={update.isPending} onChange={change} />
          ) : (
            <Badge tone={status.tone}>{customerStatusLabels[ticket.status]}</Badge>
          )}
          <Link to={`/tickets/${ticket.number}`} className={buttonClassName({ variant: 'ghost' })}>
            Abrir completo
          </Link>
        </div>
      </header>
      <div className={styles.body}>
        <div className={styles.content}>
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
          <Conversation ticket={ticket} isStaff={isStaff} />
        </div>
      </div>
    </>
  )
}

function TicketControls({
  ticket,
  saving,
  onChange,
}: {
  ticket: Ticket
  /** Se está guardando un cambio: los campos siguen en su sitio (con el foco) pero no aceptan otro. */
  saving: boolean
  onChange: ReturnType<typeof useTicketChange>['change']
}) {
  const assignees = useAssignees()
  const onStatus: SelectProps['onChange'] = (event) => {
    const status = event.target.value as Ticket['status']
    onChange({ status }, `Estado: ${ticketStatus[status].label}`)
  }
  return (
    <>
      <Select
        label="Estado"
        value={ticket.status}
        aria-disabled={saving || undefined}
        onChange={onStatus}
        fieldClassName={styles.field}
      >
        {ticketStatusValues.map((status) => (
          <option key={status} value={status}>
            {ticketStatus[status].label}
          </option>
        ))}
      </Select>
      <Select
        label="Responsable"
        value={ticket.assignee?.id ?? ''}
        disabled={assignees.isPending}
        aria-disabled={saving || undefined}
        fieldClassName={styles.field}
        onChange={(event) => {
          const assigneeId = event.target.value || null
          const name = assignees.data?.find((member) => member.id === assigneeId)?.name
          onChange({ assigneeId }, name ? `Asignado a ${firstName(name)}` : 'Ticket sin responsable')
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
    </>
  )
}

/**
 * Cabecera y conversación en esqueleto. Los controles son los reales (ocultos y desactivados): la cabecera mide lo mismo
 * que con el ticket cargado y la conversación no se mueve al llegar los datos.
 */
export function TicketPreviewSkeleton({ isStaff }: { isStaff: boolean }) {
  return (
    <div role="status" className={styles.fill}>
      <span className="visually-hidden">Cargando ticket…</span>
      <header className={styles.header} aria-hidden="true">
        <div className={styles.titles}>
          <p className={cx(styles.context, styles.ghostTitle, skeletonBarClassName)}>{'\u00a0'.repeat(40)}</p>
          <h2 className={cx(styles.title, styles.ghostTitle, skeletonBarClassName)}>{'\u00a0'.repeat(30)}</h2>
        </div>
        <div className={cx(styles.controls, styles.hidden)}>
          {isStaff ? (
            <>
              <Select label="Estado" disabled tabIndex={-1} fieldClassName={styles.field}>
                <option />
              </Select>
              <Select label="Responsable" disabled tabIndex={-1} fieldClassName={styles.field}>
                <option />
              </Select>
            </>
          ) : (
            <Badge tone="neutral">{'\u00a0'.repeat(12)}</Badge>
          )}
          <span className={buttonClassName({ variant: 'ghost' })}>Abrir completo</span>
        </div>
      </header>
      <div className={styles.body} aria-hidden="true">
        <div className={styles.content}>
          <Skeleton lines={3} label="" />
          <Skeleton lines={3} label="" />
        </div>
      </div>
    </div>
  )
}

/** El panel derecho sin ticket abierto. */
export function NoTicketSelected() {
  return (
    <div className={styles.state}>
      <EmptyState
        headingLevel={2}
        title="Ningún ticket seleccionado"
        description="Elige un ticket de la lista para ver la conversación y responder."
      />
    </div>
  )
}
