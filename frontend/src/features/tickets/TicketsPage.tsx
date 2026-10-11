import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  Button,
  buttonClassName,
  EmptyState,
  FilterChip,
  Icon,
  IconButton,
  Menu,
  SearchField,
  Skeleton,
  ticketPriority,
  ticketStatus,
  useToast,
  type MenuItem,
} from '../../components/ui'
import { isApiError } from '../../api/client'
import type { TicketPriority, TicketStatus, TicketSummary, TicketView } from '../../domain/ticket'
import { ticketPriorityValues, ticketStatusValues } from '../../domain/ticket'
import { focusPageHeadingIfFocusLost } from '../../lib/focusPageHeading'
import {
  demoErrorMessage,
  isLockTimeout,
  LOCK_RETRY_DELAY_MS,
  LOCK_TIMEOUT_MESSAGE,
  LOCK_TOAST_DURATION,
} from '../../lib/mutationError'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { useMediaQuery } from '../../lib/useMediaQuery'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
import { useTimeZone } from '../session/useTimeZone'
import { useAssignees } from '../team/queries'
import { InboxList, InboxListSkeleton } from './InboxList'
import {
  effectiveInboxState,
  hasActiveFilters,
  inboxListParams,
  openStatusValues,
  readInboxState,
  writeInboxState,
  type InboxState,
} from './inboxParams'
import { useInboxTickets, useQuickTicketUpdate, useTicketCount, useTicketMetrics, type TicketChanges } from './queries'
import { NoTicketSelected, TicketPreview } from './TicketPreview'
import { useBottomReserve } from './useBottomReserve'
import styles from './TicketsPage.module.css'

interface ViewPill {
  view: TicketView
  label: string
}

const staffViews: ViewPill[] = [
  { view: 'all', label: 'Abiertos' },
  { view: 'mine', label: 'Míos' },
  { view: 'unassigned', label: 'Sin asignar' },
  { view: 'resolved', label: 'Resueltos' },
]

const customerViews: ViewPill[] = [
  { view: 'all', label: 'Abiertas' },
  { view: 'resolved', label: 'Resueltas' },
]

/** Lo que dice una vista sin tickets, sin filtros de por medio: en voz de quien la mira. */
const emptyViewTitles: Record<TicketView, string> = {
  all: 'No hay tickets abiertos',
  mine: 'No tienes tickets asignados',
  unassigned: 'Todos los tickets tienen responsable',
  resolved: 'Todavía no hay tickets resueltos',
}

export function TicketsPage() {
  const me = useMe()
  if (me.isPending) {
    return (
      <div className={pageStyles.page}>
        <Skeleton lines={2} label="Cargando…" />
      </div>
    )
  }
  return <Inbox isStaff={me.data ? me.data.role !== 'customer' : false} />
}

function Inbox({ isStaff }: { isStaff: boolean }) {
  // Desde 1200 px la bandeja es de dos paneles; por debajo, solo la lista y cada fila abre el detalle. El panel derecho no
  // se oculta con CSS: no existe, así que no pide la conversación ni repite ids que no se ven.
  const twoPanes = useMediaQuery('(min-width: 1200px)')
  const timeZone = useTimeZone()
  const reserve = useBottomReserve()
  const [searchParams, setSearchParams] = useSearchParams()
  const state = effectiveInboxState(readInboxState(searchParams), isStaff)
  const [searchText, setSearchText] = useState(state.q)
  const debouncedSearch = useDebouncedValue(searchText)

  const update = (changes: Partial<InboxState>) =>
    setSearchParams(writeInboxState({ ...state, ...changes }), { replace: true })

  // La búsqueda escrita pasa a la URL al dejar de teclear.
  const pushedSearch = useRef(state.q)
  useEffect(() => {
    if (debouncedSearch.trim() !== state.q.trim()) {
      pushedSearch.current = debouncedSearch.trim()
      update({ q: debouncedSearch })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona al texto ya estabilizado
  }, [debouncedSearch])

  // Si la URL cambia por otra vía (atrás, adelante, un enlace), el campo refleja la búsqueda de la URL.
  useEffect(() => {
    if (state.q.trim() !== pushedSearch.current) {
      pushedSearch.current = state.q.trim()
      setSearchText(state.q)
    }
  }, [state.q])

  const list = useInboxTickets(inboxListParams(state))
  const filtersActive = hasActiveFilters(state)
  const clearFilters = () => {
    setSearchText('')
    update({ status: undefined, priority: undefined, assignee: undefined, q: '' })
  }

  const style = { '--inbox-reserve': `${reserve}px` } as CSSProperties
  return (
    <div className={styles.workspace} style={style}>
      <section aria-label="Bandeja de tickets" className={styles.listPane}>
        <div className={styles.head}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{isStaff ? 'Tickets' : 'Mis solicitudes'}</h1>
            {isStaff && (
              <Link to="/tickets/nuevo" className={buttonClassName()}>
                <Icon name="plus" />
                Nuevo ticket
              </Link>
            )}
          </div>
          <SearchField
            label="Buscar tickets"
            placeholder={isStaff ? 'Buscar por asunto, cliente o número…' : 'Buscar en tus solicitudes…'}
            value={searchText}
            onValueChange={setSearchText}
            fieldClassName={styles.search}
          />
          <ViewPills state={state} isStaff={isStaff} />
          {isStaff && (
            <div className={styles.filters}>
              {state.view !== 'resolved' && (
                <FilterMenu
                  label="Estado"
                  value={state.status}
                  options={ticketStatusValues
                    .filter((status) => openStatusValues.includes(status))
                    .map((status) => ({ value: status, label: ticketStatus[status].label }))}
                  onChange={(status) => update({ status: status as TicketStatus | undefined })}
                />
              )}
              <FilterMenu
                label="Prioridad"
                value={state.priority}
                options={ticketPriorityValues.map((priority) => ({
                  value: priority,
                  label: ticketPriority[priority].label,
                }))}
                onChange={(priority) => update({ priority: priority as TicketPriority | undefined })}
              />
              <AssigneeFilter value={state.assignee} onChange={(assignee) => update({ assignee })} />
            </div>
          )}
        </div>

        <ListBody
          state={state}
          list={list}
          isStaff={isStaff}
          twoPanes={twoPanes}
          timeZone={timeZone}
          filtersActive={filtersActive}
          onClearFilters={clearFilters}
          rowActions={isStaff && !twoPanes}
        />
      </section>

      {twoPanes && (
        <section aria-label="Vista previa del ticket" className={styles.previewPane}>
          {state.ticket ? (
            <TicketPreview number={state.ticket} isStaff={isStaff} onClear={() => update({ ticket: undefined })} />
          ) : (
            <NoTicketSelected />
          )}
        </section>
      )}
    </div>
  )
}

/** Vistas con su número: el de las métricas para el personal; un recuento por vista para un cliente. */
function ViewPills({ state, isStaff }: { state: InboxState; isStaff: boolean }) {
  const metrics = useTicketMetrics(isStaff)
  const customerOpen = useTicketCount({ view: 'all', status: [...openStatusValues], priority: [] }, !isStaff)
  const customerResolved = useTicketCount({ view: 'resolved', status: [], priority: [] }, !isStaff)
  const counts: Partial<Record<TicketView, number>> = isStaff
    ? metrics.data
      ? {
          // La vista «all» de la API incluye los resueltos; «Abiertos» no.
          all: Math.max(metrics.data.views.all - metrics.data.views.resolved, 0),
          mine: metrics.data.views.mine,
          unassigned: metrics.data.views.unassigned,
          resolved: metrics.data.views.resolved,
        }
      : {}
    : { all: customerOpen.data, resolved: customerResolved.data }
  return (
    <nav aria-label="Vistas de la bandeja">
      <ul className={styles.views}>
        {(isStaff ? staffViews : customerViews).map((item) => (
          <li key={item.view}>
            <Link
              to={{ search: writeInboxState({ ...state, view: item.view }).toString() }}
              replace
              className={styles.view}
              aria-current={state.view === item.view ? 'true' : undefined}
            >
              {item.label}{' '}
              {/* El hueco del número se reserva mientras llega: la fila de vistas no cambia de alto al cargar. */}
              <span className={styles.count} aria-hidden={counts[item.view] === undefined ? 'true' : undefined}>
                {counts[item.view] ?? '\u2007'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

interface ListBodyProps {
  state: InboxState
  list: ReturnType<typeof useInboxTickets>
  isStaff: boolean
  twoPanes: boolean
  timeZone: string
  filtersActive: boolean
  onClearFilters: () => void
  rowActions: boolean
}

function ListBody({
  state,
  list,
  isStaff,
  twoPanes,
  timeZone,
  filtersActive,
  onClearFilters,
  rowActions,
}: ListBodyProps) {
  if (list.isPending) return <InboxListSkeleton />
  if (!list.data) {
    const restricted = isApiError(list.error, 403)
    return (
      <div className={styles.state}>
        <EmptyState
          kind={restricted ? 'restricted' : 'error'}
          title={restricted ? 'No tienes permiso para ver los tickets' : 'No pudimos cargar los tickets'}
          description={
            restricted
              ? 'Pide acceso a un administrador de tu organización.'
              : 'Revisa tu conexión y vuelve a intentarlo.'
          }
          live={!restricted && list.failureCount > 1}
          action={
            !restricted && (
              <Button variant="secondary" onClick={() => void list.refetch()}>
                Reintentar
              </Button>
            )
          }
        />
      </div>
    )
  }
  const { items, totalItems } = list.data
  if (items.length === 0) {
    const noun = isStaff ? 'tickets' : 'solicitudes'
    if (filtersActive) {
      return (
        <div className={styles.state}>
          <EmptyState
            kind="noResults"
            title={`No encontramos ${noun}`}
            description="Prueba otra búsqueda o quita los filtros."
            action={
              <Button variant="secondary" onClick={onClearFilters}>
                Limpiar filtros
              </Button>
            }
          />
        </div>
      )
    }
    if (state.view !== 'all') {
      return (
        <div className={styles.state}>
          <EmptyState
            kind="noResults"
            title={isStaff ? emptyViewTitles[state.view] : 'Todavía no tienes solicitudes resueltas'}
            description={isStaff ? 'Cuando haya alguno, aparecerá aquí.' : 'Cuando resolvamos una, la verás aquí.'}
          />
        </div>
      )
    }
    return (
      <div className={styles.state}>
        <EmptyState
          title={isStaff ? 'No hay tickets abiertos' : 'No tienes solicitudes abiertas'}
          description={
            isStaff ? 'Crea un ticket o revisa los resueltos.' : 'Cuando abras una solicitud aparecerá aquí.'
          }
          action={
            isStaff && (
              <Link to="/tickets/nuevo" className={buttonClassName()}>
                Crear ticket
              </Link>
            )
          }
        />
      </div>
    )
  }
  return (
    <InboxList
      items={items}
      totalItems={totalItems}
      selectedNumber={twoPanes ? state.ticket : undefined}
      linkTo={(ticket) =>
        twoPanes
          ? { search: writeInboxState({ ...state, ticket: ticket.number }).toString() }
          : `/tickets/${ticket.number}`
      }
      customerView={!isStaff}
      renderActions={rowActions ? (ticket) => <RowActions ticket={ticket} /> : undefined}
      timeZone={timeZone}
      hasMore={list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      loadMoreFailed={list.isFetchNextPageError}
      onLoadMore={() => void list.fetchNextPage()}
    />
  )
}

/**
 * Menú de acciones rápidas de una fila, para cuando no hay vista previa con sus propios controles (por debajo de
 * 1200 px). Cada fila lleva su propia mutación: con una sola para toda la lista, TanStack solo llamaría a los
 * callbacks de la última acción y la primera se quedaría sin aviso. Una sola llamada por acción: el reintento de un
 * 503 de bloqueo la repite tal cual, con la versión que leyó la primera vez.
 */
function RowActions({ ticket }: { ticket: TicketSummary }) {
  const me = useMe()
  const toast = useToast()
  const quickUpdate = useQuickTicketUpdate()

  function run(changes: TicketChanges, success: string) {
    const variables = { number: ticket.number, changes }
    const attempt = () =>
      quickUpdate.mutate(variables, {
        onSuccess: () => toast.show({ title: success }),
        onError: (error) =>
          toast.show(
            isLockTimeout(error)
              ? {
                  tone: 'error',
                  title: `No se pudo actualizar el ticket #${ticket.number}`,
                  description: LOCK_TIMEOUT_MESSAGE,
                  // La persona decide cuándo repetir: el aviso no se cierra solo enseguida.
                  duration: LOCK_TOAST_DURATION,
                  action: {
                    label: 'Reintentar',
                    ariaLabel: `Reintentar actualizar el ticket #${ticket.number}`,
                    delay: LOCK_RETRY_DELAY_MS,
                    onSelect: () => {
                      attempt()
                      // El aviso se cierra con el foco dentro: vuelve al menú de la fila (o al título si la fila ya no está).
                      const trigger = document.querySelector<HTMLElement>(
                        `[aria-label="Acciones del ticket #${ticket.number}"]`,
                      )
                      if (trigger) trigger.focus()
                      else focusPageHeadingIfFocusLost()
                    },
                  },
                }
              : {
                  tone: 'error',
                  title: `No se pudo actualizar el ticket #${ticket.number}`,
                  description: isApiError(error, 412)
                    ? 'Otra persona lo cambió a la vez. Revisa los cambios e inténtalo de nuevo.'
                    : (demoErrorMessage(error) ?? 'Inténtalo de nuevo en unos segundos.'),
                },
          ),
      })
    attempt()
  }

  const items: MenuItem[] = [
    {
      id: 'assign-me',
      label: 'Asignarme',
      disabled: !me.data || ticket.assignee?.id === me.data.user.id,
      onSelect: () => run({ assigneeId: me.data?.user.id }, `Te asignaste el ticket #${ticket.number}`),
    },
    {
      id: 'resolve',
      label: 'Marcar como resuelto',
      disabled: ticket.status === 'resolved',
      onSelect: () => run({ status: 'resolved' }, `Ticket #${ticket.number} resuelto`),
    },
  ]
  return (
    <Menu label={`Acciones del ticket #${ticket.number}`} items={items}>
      {(trigger) => <IconButton icon="more" label={`Acciones del ticket #${ticket.number}`} {...trigger} />}
    </Menu>
  )
}

interface FilterOption {
  value: string
  label: string
}

function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value?: string
  options: FilterOption[]
  onChange: (value: string | undefined) => void
}) {
  const selected = options.find((option) => option.value === value)
  const items: MenuItem[] = [
    { id: 'all', label: `Todos (${label.toLowerCase()})`, onSelect: () => onChange(undefined) },
    ...options.map((option) => ({ id: option.value, label: option.label, onSelect: () => onChange(option.value) })),
  ]
  return (
    <Menu label={`Filtrar por ${label.toLowerCase()}`} items={items} placement="bottom-start">
      {(trigger) => (
        <FilterChip selected={Boolean(selected)} {...trigger}>
          {selected ? `${label}: ${selected.label}` : label}
        </FilterChip>
      )}
    </Menu>
  )
}

function AssigneeFilter({ value, onChange }: { value?: string; onChange: (value: string | undefined) => void }) {
  const assignees = useAssignees()
  const options: FilterOption[] = [
    { value: 'none', label: 'Sin asignar' },
    ...(assignees.data ?? []).map((member) => ({ value: member.id, label: member.name })),
  ]
  return <FilterMenu label="Responsable" value={value} options={options} onChange={onChange} />
}
