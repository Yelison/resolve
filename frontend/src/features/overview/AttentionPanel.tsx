import { useState, type RefObject } from 'react'
import { Link } from 'react-router'
import { isApiError } from '../../api/client'
import { Badge, Button, buttonClassName, EmptyState, useToast, type BadgeTone } from '../../components/ui'
import type { TicketSummary } from '../../domain/ticket'
import { cx } from '../../lib/cx'
import { formatRelative } from '../../lib/format'
import { demoErrorMessage, isLockTimeout, LOCK_TIMEOUT_MESSAGE } from '../../lib/mutationError'
import { useMe } from '../session/queries'
import { useQuickTicketUpdate, useTicketMetrics } from '../tickets/queries'
import { selectAttention, type AttentionItem, type AttentionReason } from './attention'
import { inboxLink, useAttentionTickets, type AttentionScope } from './attentionQueries'
import { BlockError } from './BlockError'
import { Ghost } from './Ghost'
import { useNow } from './useNow'
import { useRetryFocus } from './useRetryFocus'
import styles from './AttentionPanel.module.css'

const reasonTones: Record<AttentionReason, BadgeTone> = {
  urgent: 'red',
  unanswered: 'amber',
  unassigned: 'amber',
  customerReplied: 'blue',
  high: 'blue',
  waiting: 'neutral',
}

/** Textos de muestra para el esqueleto: tres filas con un asunto largo, que es lo que más altura da. */
const ghostItems: AttentionItem[] = [1, 2, 3].map((number) => ({
  ticket: {
    id: `ghost-${number}`,
    number: 1000 + number,
    subject: 'Error al procesar el pago con la tarjeta corporativa en la renovación anual del plan Pro',
    status: 'open',
    priority: 'urgent',
    channel: 'email',
    customer: { id: 'ghost', name: 'María Pérez', email: 'maria@cliente.example', company: null },
    assignee: null,
    lastMessage: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  reason: 'urgent',
  label: 'Urgente',
  action: 'assign',
}))

/** Para las filas de muestra: no se leen, solo ocupan su altura. */
const ghostNow = new Date(0)

function ticketPath(ticket: TicketSummary) {
  return `/tickets/${ticket.number}`
}

/**
 * «Necesitan atención»: los 6 tickets más urgentes del alcance elegido, cada uno con su motivo y la acción que toca.
 * Por defecto «Para mí»; si no tienes nada asignado, «Todo el equipo», y la línea del pie lo explica. La elección de
 * quien usa la página no se pisa: el valor por defecto solo se decide mientras no haya elegido.
 */
export function AttentionPanel() {
  const me = useMe()
  const metrics = useTicketMetrics()
  const [chosen, setChosen] = useState<AttentionScope>()
  const mineCount = metrics.data?.views.mine
  const teamCount = metrics.data?.open
  // Sin métricas no se sabe si hay algo asignado: mientras cargan no se elige alcance, y si fallan se muestra el equipo.
  const scope: AttentionScope | undefined =
    chosen ?? (metrics.isSuccess ? (mineCount! > 0 ? 'mine' : 'team') : metrics.isError ? 'team' : undefined)
  const defaultedToTeam = chosen === undefined && scope === 'team' && metrics.isSuccess

  const tickets = useAttentionTickets(scope)
  const focus = useRetryFocus<HTMLElement>(tickets.isSuccess)
  const now = useNow()

  // Tickets que la persona acaba de asignarse: se leen como suyos hasta que la lista se vuelve a pedir.
  const [assigned, setAssigned] = useState<ReadonlySet<string>>(new Set())
  const user = me.data?.user
  const candidates = tickets.data?.items.map((ticket) =>
    assigned.has(ticket.id) && user && ticket.assignee === null
      ? { ...ticket, assignee: { id: user.id, name: user.name } }
      : ticket,
  )
  const attention = candidates ? selectAttention(candidates, now, user?.id) : undefined
  // El total es el de la bandeja con el mismo filtro: la cifra del pie y la de la bandeja coinciden.
  const total = tickets.data?.totalItems ?? 0

  // El pie y el vacío hablan del alcance de la lista que se ve, no del que se acaba de pulsar: mientras llega la nueva
  // lista (la anterior sigue a la vista) no cambian, y lo de debajo no se mueve. Se actualiza al asentarse los datos.
  const [shown, setShown] = useState<{ scope: AttentionScope; explainDefault: boolean }>()
  if (scope && !tickets.isPlaceholderData && tickets.isSuccess) {
    if (shown?.scope !== scope || shown.explainDefault !== defaultedToTeam) {
      setShown({ scope, explainDefault: defaultedToTeam })
    }
  }
  const shownScope = shown?.scope ?? scope

  return (
    <section ref={focus.ref} className={styles.panel} aria-labelledby="overview-attention" tabIndex={-1}>
      <div className={styles.header}>
        <h2 id="overview-attention" className={styles.title}>
          Necesitan atención
        </h2>
        <ScopeToggle scope={scope} onChange={setChosen} mine={mineCount} team={teamCount} />
      </div>
      {tickets.isError && !tickets.data ? (
        <div className={styles.state}>
          <BlockError
            error={tickets.error}
            failureCount={tickets.failureCount}
            title="No pudimos cargar los tickets"
            restrictedTitle="No tienes permiso para ver los tickets"
            retryLabel="Reintentar cargar los tickets que necesitan atención"
            onRetry={() => focus.retry(tickets.refetch)}
          />
        </div>
      ) : !attention || scope === undefined ? (
        <Ghost label="Cargando los tickets que necesitan atención…" className={styles.ghost}>
          <ul className={styles.list}>
            {ghostItems.map((item) => (
              <Row key={item.ticket.id} item={item} userId={undefined} now={ghostNow} onAssigned={() => {}} />
            ))}
          </ul>
        </Ghost>
      ) : (
        // Al cambiar de alcance se ve la lista anterior (atenuada y sin poder activarse) hasta que llega la nueva.
        <div inert={tickets.isPlaceholderData} className={cx(tickets.isPlaceholderData && styles.stale)}>
          {attention.items.length === 0 ? (
            <div className={styles.state}>
              <NothingUrgent scope={shownScope ?? scope} total={total} />
            </div>
          ) : (
            <ul
              className={styles.list}
              aria-label="Tickets que necesitan atención"
              aria-busy={tickets.isPlaceholderData}
            >
              {attention.items.map((item) => (
                <Row
                  key={item.ticket.id}
                  item={item}
                  userId={user?.id}
                  now={now}
                  onAssigned={() => setAssigned((ids) => new Set(ids).add(item.ticket.id))}
                  panelRef={focus.ref}
                />
              ))}
            </ul>
          )}
          <Footer
            scope={shownScope ?? scope}
            shown={attention.items.length}
            total={total}
            explainDefault={shown?.explainDefault ?? defaultedToTeam}
          />
        </div>
      )}
    </section>
  )
}

function ScopeToggle({
  scope,
  onChange,
  mine,
  team,
}: {
  scope: AttentionScope | undefined
  onChange: (scope: AttentionScope) => void
  mine: number | undefined
  team: number | undefined
}) {
  const options: { value: AttentionScope; label: string; count: number | undefined }[] = [
    { value: 'mine', label: 'Para mí', count: mine },
    { value: 'team', label: 'Todo el equipo', count: team },
  ]
  return (
    <div role="group" aria-label="Mostrar los tickets de" className={styles.toggle}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={scope === option.value}
          className={styles.toggleButton}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && (
            <>
              {' '}
              <span className={styles.count}>{option.count}</span>
            </>
          )}
        </button>
      ))}
    </div>
  )
}

/** Sin tickets con motivo: lo que se dice depende de si no hay nada, nada tuyo o solo nada urgente. */
function NothingUrgent({ scope, total }: { scope: AttentionScope; total: number }) {
  if (total === 0) {
    return scope === 'mine' ? (
      <EmptyState
        icon="check"
        headingLevel={3}
        title="No tienes tickets asignados"
        description="Cuando te asignen uno, aparecerá aquí."
      />
    ) : (
      <EmptyState
        icon="check"
        headingLevel={3}
        title="Nada pendiente"
        description="No hay tickets abiertos ni en progreso."
      />
    )
  }
  return (
    <EmptyState
      icon="check"
      headingLevel={3}
      title="Nada urgente por ahora"
      description={scope === 'mine' ? 'Tus tickets abiertos van al día.' : 'Los tickets abiertos van al día.'}
    />
  )
}

function Footer({
  scope,
  shown,
  total,
  explainDefault,
}: {
  scope: AttentionScope
  shown: number
  total: number
  explainDefault: boolean
}) {
  if (total === 0) return null
  // «Los 6 más urgentes de 34»: solo cuando hay más de los que se muestran; si caben todos, se dice cuántos hay.
  const summary =
    shown < total
      ? `${shown === 1 ? 'El más urgente' : `Los ${shown} más urgentes`} de ${total}`
      : total === 1
        ? '1 ticket abierto'
        : `${total} tickets abiertos`
  const linkText =
    total > shown ? (total === 1 ? 'Ver el ticket en la bandeja' : `Ver los ${total} en la bandeja`) : 'Ir a la bandeja'
  return (
    <>
      {explainDefault && (
        <p className={styles.note}>No tienes tickets asignados. Te mostramos lo que el equipo tiene pendiente.</p>
      )}
      <div className={styles.footer}>
        <p className={styles.summary} role="status">
          {summary}
        </p>
        <Link to={inboxLink(scope)} className={styles.footerLink}>
          {linkText}
        </Link>
      </div>
    </>
  )
}

function Row({
  item,
  userId,
  now,
  onAssigned,
  panelRef,
}: {
  item: AttentionItem
  userId: string | undefined
  now: Date
  onAssigned: () => void
  panelRef?: RefObject<HTMLElement | null>
}) {
  const { ticket } = item
  const who = ticket.assignee
    ? ticket.assignee.id === userId
      ? 'asignado a ti'
      : ticket.assignee.name
    : 'sin responsable'
  return (
    <li className={styles.row}>
      <Badge tone={reasonTones[item.reason]} className={styles.reason}>
        {item.label}
      </Badge>
      <div className={styles.main}>
        <Link to={ticketPath(ticket)} className={styles.subject} data-attention-link={ticket.id}>
          #{ticket.number} {ticket.subject}
        </Link>
        {item.detail && <span className={styles.detail}>{item.detail}</span>}
        {item.reason === 'customerReplied' && ticket.lastMessage && (
          <span className={styles.excerpt}>«{ticket.lastMessage.excerpt}»</span>
        )}
        <span className={styles.meta}>
          {ticket.customer.name} · {who} · {formatRelative(new Date(ticket.updatedAt), now)}
        </span>
      </div>
      <div className={styles.action}>
        {item.action === 'assign' ? (
          <AssignButton ticket={ticket} onAssigned={onAssigned} panelRef={panelRef} />
        ) : (
          <Link to={ticketPath(ticket)} className={buttonClassName({ variant: 'secondary' })}>
            {item.action === 'reply' ? 'Responder' : 'Abrir'}
            <span className="visually-hidden"> el ticket #{ticket.number}</span>
          </Link>
        )}
      </div>
    </li>
  )
}

/**
 * «Asignármelo»: la misma escritura que la bandeja (lee la versión del ticket y aplica el cambio con su If-Match, así
 * que si alguien lo cambió en medio la API responde 412 y no se pisa nada). El resultado se anuncia en un aviso, y el
 * foco pasa al enlace del propio ticket, que sustituye al botón.
 */
function AssignButton({
  ticket,
  onAssigned,
  panelRef,
}: {
  ticket: TicketSummary
  onAssigned: () => void
  panelRef?: RefObject<HTMLElement | null>
}) {
  const me = useMe()
  const toast = useToast()
  const update = useQuickTicketUpdate()
  return (
    <Button
      variant="secondary"
      loading={update.isPending}
      loadingLabel="Asignando…"
      disabled={!me.data}
      onClick={() =>
        update.mutate(
          { number: ticket.number, changes: { assigneeId: me.data?.user.id } },
          {
            onSuccess: () => {
              toast.show({ title: `Te asignaste el ticket #${ticket.number}` })
              onAssigned()
              // El botón se sustituye por «Abrir»: el foco va al enlace del ticket, o al panel si la fila ya no está.
              requestAnimationFrame(() => {
                const link = document.querySelector<HTMLElement>(`[data-attention-link="${ticket.id}"]`)
                ;(link ?? panelRef?.current)?.focus()
              })
            },
            onError: (error) =>
              toast.show({
                tone: 'error',
                title: `No se pudo asignar el ticket #${ticket.number}`,
                description: isLockTimeout(error)
                  ? LOCK_TIMEOUT_MESSAGE
                  : isApiError(error, 412)
                    ? 'Otra persona lo cambió a la vez. Revisa los cambios e inténtalo de nuevo.'
                    : (demoErrorMessage(error) ?? 'Inténtalo de nuevo en unos segundos.'),
              }),
          },
        )
      }
    >
      Asignármelo
      <span className="visually-hidden"> el ticket #{ticket.number}</span>
    </Button>
  )
}
