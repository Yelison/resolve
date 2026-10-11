import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router'
import { isApiError } from '../../api/client'
import { Badge, Button, buttonClassName, EmptyState, useToast, type BadgeTone } from '../../components/ui'
import type { AttentionItem, AttentionReasonKind, AttentionTicket } from '../../api/schema'
import { cx } from '../../lib/cx'
import { formatRelative } from '../../lib/format'
import { demoErrorMessage, isLockTimeout, LOCK_TIMEOUT_MESSAGE } from '../../lib/mutationError'
import { useMe } from '../session/queries'
import {
  ticketKeys,
  TicketPreconditionError,
  useAttention,
  useQuickTicketUpdate,
  useTicketMetrics,
  type AttentionScope,
} from '../tickets/queries'
import { ATTENTION_LIMIT, describeAttention, inboxLink } from './attention'
import { BlockError } from './BlockError'
import { Ghost } from './Ghost'
import { useNow } from './useNow'
import { useRetryFocus } from './useRetryFocus'
import styles from './AttentionPanel.module.css'

const reasonTones: Record<AttentionReasonKind, BadgeTone> = {
  urgent: 'red',
  unanswered: 'amber',
  unassigned: 'amber',
  customer_replied: 'blue',
  high: 'blue',
  waiting: 'neutral',
}

/**
 * Filas de muestra para el esqueleto, representativas: un asunto de unos 50 caracteres y, en la mitad de las filas, una
 * línea de detalle («Sin respuesta desde hace 3 h»), como las filas reales más habituales. La altura de una fila real
 * depende de su texto, así que con otros asuntos el bloque de debajo se mueve algo al llegar la lista.
 */
const ghostItems: AttentionItem[] = [1, 2, 3, 4, 5, 6].map((number) => ({
  ticket: {
    id: `ghost-${number}`,
    number: 1000 + number,
    subject: 'Error al procesar el pago con la tarjeta corporativa',
    status: 'open',
    priority: 'medium',
    customer: { id: 'ghost', name: 'Nombre Cliente', email: 'cliente@correo.test', company: null },
    assignee: null,
    updatedAt: '2026-01-01T00:00:00Z',
  },
  // La mitad de los motivos llevan una línea de detalle: se alternan.
  reason:
    number % 2 === 0
      ? { kind: 'unanswered', since: '2026-01-01T00:00:00Z', excerpt: null }
      : { kind: 'urgent', since: '2026-01-01T00:00:00Z', excerpt: null },
}))

/** Para las filas de muestra: no se leen, solo ocupan su altura. */
const ghostNow = new Date(0)

function ticketPath(ticket: AttentionTicket) {
  return `/tickets/${ticket.number}`
}

/**
 * «Necesitan atención»: los 6 tickets más urgentes del alcance elegido, cada uno con su motivo y la acción que toca. El
 * servidor elige y ordena (sobre todos los tickets del alcance, no sobre una página); aquí solo se dibuja. Por defecto «Para mí»; si no tienes nada asignado, «Todo el equipo», y la línea del pie lo explica. La elección de
 * quien usa la página no se pisa: el valor por defecto solo se decide mientras no haya elegido.
 */
export function AttentionPanel() {
  const me = useMe()
  const metrics = useTicketMetrics()
  const [chosen, setChosen] = useState<AttentionScope>()
  // El alcance por defecto se decide una sola vez, cuando llegan las métricas por primera vez: una asignación hecha desde
  // este mismo panel cambia `views.mine` y no debe cambiar la lista (ni quitar el foco) a quien acaba de pulsar.
  const [fixedDefault, setFixedDefault] = useState<AttentionScope>()
  const mineCount = metrics.data?.views.mine
  const teamCount = metrics.data?.open
  if (fixedDefault === undefined && metrics.isSuccess) setFixedDefault(mineCount! > 0 ? 'mine' : 'team')
  // Sin métricas no se sabe si hay algo asignado: mientras cargan no se elige alcance, y si fallan se muestra el equipo
  // (sin fijarlo: si luego llegan, deciden).
  const scope: AttentionScope | undefined = chosen ?? fixedDefault ?? (metrics.isError ? 'team' : undefined)
  // La nota «no tienes tickets asignados» solo vale mientras es verdad.
  const defaultedToTeam = chosen === undefined && fixedDefault === 'team' && mineCount === 0

  // Mientras llega la lista ya se sabe cuántos hay (las métricas decidieron el alcance): el esqueleto tiene tantas filas.
  const expected = scope === 'mine' ? mineCount : scope === 'team' ? teamCount : undefined
  const ghostRows = Math.min(ghostItems.length, Math.max(1, expected ?? 3))

  const attention = useAttention(scope, ATTENTION_LIMIT)
  const focus = useRetryFocus<HTMLElement>(attention.isSuccess)
  const now = useNow()

  // Tickets que la persona acaba de asignarse: se leen como suyos hasta que la lista se vuelve a pedir.
  const [assigned, setAssigned] = useState<ReadonlySet<string>>(new Set())
  const user = me.data?.user
  const items = attention.data?.items.map((item) =>
    assigned.has(item.ticket.id) && user && item.ticket.assignee === null
      ? { ...item, ticket: { ...item.ticket, assignee: { id: user.id, name: user.name } } }
      : item,
  )
  // Los abiertos del alcance, sean o no motivo de atención: la cifra del pie y la de la bandeja coinciden.
  const open = attention.data?.open ?? 0

  // Si la fila del ticket que se acaba de asignar ya no está cuando llega la lista nueva (asignado deja de ser motivo),
  // el foco que tenía su enlace pasa al panel y no a `body`. Solo vale para la primera lista posterior a la asignación,
  // esté o no la fila: una lista más tardía no debe llevarse el foco de quien ya lo movió.
  const justAssigned = useRef<{ id: string; list: unknown; at: number }>(undefined)
  useEffect(() => {
    const pending = justAssigned.current
    // La lista nueva es la que ya no es la de antes de asignar (otro objeto, o un momento de lectura posterior).
    if (pending === undefined || (attention.data === pending.list && attention.dataUpdatedAt <= pending.at)) return
    justAssigned.current = undefined
    if (document.querySelector(`[data-attention-link="${pending.id}"]`)) return
    if (document.activeElement === document.body || document.activeElement === null) focus.ref.current?.focus()
  }, [attention.data, attention.dataUpdatedAt, focus.ref])

  // El pie y el vacío hablan del alcance de la lista que se ve, no del que se acaba de pulsar: mientras llega la nueva
  // lista (la anterior sigue a la vista) no cambian, y lo de debajo no se mueve. Se actualiza al asentarse los datos.
  const [shown, setShown] = useState<{ scope: AttentionScope; explainDefault: boolean }>()
  if (scope && !attention.isPlaceholderData && attention.isSuccess) {
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
      {attention.isError && !attention.data ? (
        <div className={styles.state}>
          <BlockError
            error={attention.error}
            failureCount={attention.failureCount}
            title="No pudimos cargar los tickets"
            restrictedTitle="No tienes permiso para ver los tickets"
            retryLabel="Reintentar cargar los tickets que necesitan atención"
            onRetry={() => focus.retry(attention.refetch)}
          />
        </div>
      ) : !items || scope === undefined ? (
        <Ghost label="Cargando los tickets que necesitan atención…" className={styles.ghost}>
          <ul className={styles.list}>
            {ghostItems.slice(0, ghostRows).map((item) => (
              <Row key={item.ticket.id} item={item} userId={undefined} now={ghostNow} onAssigned={() => {}} />
            ))}
          </ul>
          {/* El pie de muestra reserva también su altura, con la nota del alcance por defecto si va a haberla. */}
          <Footer scope="team" shown={ghostRows} total={ghostRows + 1} explainDefault={defaultedToTeam} />
        </Ghost>
      ) : (
        // Al cambiar de alcance se ve la lista anterior (atenuada y sin poder activarse) hasta que llega la nueva.
        <div inert={attention.isPlaceholderData} className={cx(attention.isPlaceholderData && styles.stale)}>
          {items.length === 0 ? (
            <div className={styles.state}>
              <NothingUrgent scope={shownScope ?? scope} open={open} />
            </div>
          ) : (
            <ul
              className={styles.list}
              aria-label="Tickets que necesitan atención"
              aria-busy={attention.isPlaceholderData}
            >
              {items.map((item) => (
                <Row
                  key={item.ticket.id}
                  item={item}
                  userId={user?.id}
                  now={now}
                  onAssigned={() => {
                    justAssigned.current = { id: item.ticket.id, list: attention.data, at: attention.dataUpdatedAt }
                    setAssigned((ids) => new Set(ids).add(item.ticket.id))
                  }}
                  panelRef={focus.ref}
                />
              ))}
            </ul>
          )}
          <Footer
            scope={shownScope ?? scope}
            shown={items.length}
            total={open}
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
function NothingUrgent({ scope, open }: { scope: AttentionScope; open: number }) {
  if (open === 0) {
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
  const { ticket, reason } = item
  const { label, detail, action } = describeAttention(item, now, userId)
  const who = ticket.assignee
    ? ticket.assignee.id === userId
      ? 'asignado a ti'
      : ticket.assignee.name
    : 'sin responsable'
  return (
    <li className={styles.row}>
      <Badge tone={reasonTones[reason.kind]} className={styles.reason}>
        {label}
      </Badge>
      <div className={styles.main}>
        <Link to={ticketPath(ticket)} className={styles.subject} data-attention-link={ticket.id}>
          #{ticket.number} {ticket.subject}
        </Link>
        {detail && <span className={styles.detail}>{detail}</span>}
        {reason.excerpt !== null && <span className={styles.excerpt}>«{reason.excerpt}»</span>}
        <span className={styles.meta}>
          {ticket.customer.name} · {who} · {formatRelative(new Date(ticket.updatedAt), now)}
        </span>
      </div>
      <div className={styles.action}>
        {action === 'assign' ? (
          <AssignButton ticket={ticket} onAssigned={onAssigned} panelRef={panelRef} />
        ) : (
          <Link to={ticketPath(ticket)} className={buttonClassName({ variant: 'secondary' })}>
            {action === 'reply' ? 'Responder' : 'Abrir'}
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
  ticket: AttentionTicket
  onAssigned: () => void
  panelRef?: RefObject<HTMLElement | null>
}) {
  const me = useMe()
  const toast = useToast()
  const queryClient = useQueryClient()
  const update = useQuickTicketUpdate()

  /** El botón se sustituye por otro control o desaparece: el foco va al enlace del ticket, o al panel si la fila ya no está. */
  function moveFocus() {
    requestAnimationFrame(() => {
      const link = document.querySelector<HTMLElement>(`[data-attention-link="${ticket.id}"]`)
      ;(link ?? panelRef?.current)?.focus()
    })
  }

  return (
    <Button
      variant="secondary"
      loading={update.isPending}
      loadingLabel="Asignando…"
      disabled={!me.data}
      onClick={() =>
        update.mutate(
          {
            number: ticket.number,
            changes: { assigneeId: me.data?.user.id },
            // «Asignármelo» solo se ofrece porque nadie lo tenía: si entre tanto otra persona lo tomó, no se lo quita.
            precondition: (current) => current.assignee === null,
          },
          {
            onSuccess: () => {
              toast.show({ title: `Te asignaste el ticket #${ticket.number}` })
              onAssigned()
              moveFocus()
            },
            onError: (error) => {
              if (error instanceof TicketPreconditionError) {
                const owner = error.current.assignee
                toast.show({
                  tone: 'info',
                  title:
                    owner && owner.id === me.data?.user.id
                      ? `El ticket #${ticket.number} ya es tuyo`
                      : `Ya lo tiene ${owner?.name ?? 'otra persona'}`,
                  description: `Actualizamos la lista con el ticket #${ticket.number}.`,
                })
                void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() })
                void queryClient.invalidateQueries({ queryKey: ticketKeys.metrics() })
                moveFocus()
                return
              }
              toast.show({
                tone: 'error',
                title: `No se pudo asignar el ticket #${ticket.number}`,
                description: isLockTimeout(error)
                  ? LOCK_TIMEOUT_MESSAGE
                  : isApiError(error, 412)
                    ? 'Otra persona lo cambió a la vez. Revisa los cambios e inténtalo de nuevo.'
                    : (demoErrorMessage(error) ?? 'Inténtalo de nuevo en unos segundos.'),
              })
            },
          },
        )
      }
    >
      Asignármelo
      <span className="visually-hidden"> el ticket #{ticket.number}</span>
    </Button>
  )
}
