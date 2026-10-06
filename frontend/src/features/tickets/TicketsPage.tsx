import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import {
  Alert,
  Button,
  buttonClassName,
  EmptyState,
  FilterChip,
  Icon,
  Menu,
  Metric,
  Pagination,
  SearchField,
  Select,
  Skeleton,
  ticketPriority,
  ticketStatus,
  TicketRow,
  TicketTable,
  useToast,
  type MenuItem,
} from '../../components/ui'
import { isApiError } from '../../api/client'
import type { TicketMetrics, TicketPriority, TicketStatus, TicketSummary, TicketView } from '../../domain/ticket'
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
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
import { useTimeZone } from '../session/useTimeZone'
import { useAssignees } from '../team/queries'
import {
  hasActiveFilters,
  readInboxState,
  ticketSortValues,
  writeInboxState,
  type InboxState,
  type TicketSort,
} from './inboxParams'
import { useQuickTicketUpdate, useTicketList, useTicketMetrics, type TicketChanges } from './queries'
import styles from './TicketsPage.module.css'

const PAGE_SIZE = 20

const sortLabels: Record<TicketSort, string> = {
  'updatedAt,desc': 'Actualización: más reciente',
  'updatedAt,asc': 'Actualización: más antigua',
  'createdAt,desc': 'Creación: más reciente',
  'createdAt,asc': 'Creación: más antigua',
  'number,desc': 'Número: mayor primero',
  'number,asc': 'Número: menor primero',
  'priority,desc': 'Prioridad: urgente primero',
  'priority,asc': 'Prioridad: baja primero',
  'status,asc': 'Estado: abiertos primero',
  'status,desc': 'Estado: resueltos primero',
}

const views: { view: TicketView; label: string; count?: keyof TicketMetrics['views'] }[] = [
  { view: 'all', label: 'Todos los tickets', count: 'all' },
  { view: 'mine', label: 'Asignados a mí', count: 'mine' },
  { view: 'unassigned', label: 'Sin asignar', count: 'unassigned' },
  { view: 'resolved', label: 'Resueltos' },
]

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
  const [searchParams, setSearchParams] = useSearchParams()
  const parsedState = readInboxState(searchParams)
  // Un cliente no tiene vistas ni filtro de responsable: se ignoran si llegan en la URL para no pedir datos de equipo.
  const state: InboxState = isStaff ? parsedState : { ...parsedState, view: 'all', assignee: undefined }
  const [searchText, setSearchText] = useState(state.q)
  const searchRef = useRef<HTMLInputElement>(null)
  const focusSearch = (useLocation().state as { focusSearch?: number } | null)?.focusSearch

  // Ctrl o ⌘ + K desde cualquier página trae aquí con la petición de enfocar el buscador.
  useEffect(() => {
    if (focusSearch) searchRef.current?.focus()
  }, [focusSearch])
  const debouncedSearch = useDebouncedValue(searchText)

  const update = (changes: Partial<InboxState>) =>
    setSearchParams(writeInboxState({ ...state, page: 1, ...changes }), { replace: true })

  // La búsqueda escrita pasa a la URL al dejar de teclear, y vuelve a la primera página.
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

  const list = useTicketList({
    view: isStaff ? state.view : 'all',
    status: state.status ? [state.status] : [],
    priority: state.priority ? [state.priority] : [],
    assigneeId: state.assignee,
    q: state.q,
    page: state.page,
    pageSize: PAGE_SIZE,
    sort: state.sort,
  })
  const metrics = useTicketMetrics(isStaff)

  const filtersActive = hasActiveFilters(state)
  const clearFilters = () => {
    setSearchText('')
    update({ status: undefined, priority: undefined, assignee: undefined, q: '' })
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Tickets"
        description={
          isStaff ? 'Un lugar para resolver, colaborar y ayudar a tus clientes.' : 'Tus solicitudes de soporte.'
        }
        actions={
          isStaff && (
            <Link to="/tickets/nuevo" className={buttonClassName()}>
              <Icon name="plus" />
              Nuevo ticket
            </Link>
          )
        }
      />

      {isStaff && <MetricsSection query={metrics} />}

      <section className={styles.inbox} aria-label="Bandeja de tickets">
        {isStaff && (
          <nav aria-label="Vistas de la bandeja">
            <ul className={styles.views}>
              {views.map((item) => (
                <li key={item.view}>
                  <Link
                    to={{ search: writeInboxState({ ...state, view: item.view, page: 1 }).toString() }}
                    replace
                    className={styles.view}
                    aria-current={state.view === item.view ? 'true' : undefined}
                  >
                    {item.label}
                    {item.count && metrics.data && (
                      <>
                        {' '}
                        <span>{metrics.data.views[item.count]}</span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className={styles.filters}>
          <SearchField
            ref={searchRef}
            label="Buscar tickets"
            placeholder="Buscar por asunto, cliente o número…"
            value={searchText}
            onValueChange={setSearchText}
            fieldClassName={styles.search}
          />
          <FilterMenu
            label="Estado"
            value={state.status}
            options={ticketStatusValues.map((status) => ({ value: status, label: ticketStatus[status].label }))}
            onChange={(status) => update({ status: status as TicketStatus | undefined })}
          />
          <FilterMenu
            label="Prioridad"
            value={state.priority}
            options={ticketPriorityValues.map((priority) => ({
              value: priority,
              label: ticketPriority[priority].label,
            }))}
            onChange={(priority) => update({ priority: priority as TicketPriority | undefined })}
          />
          {isStaff && <AssigneeFilter value={state.assignee} onChange={(assignee) => update({ assignee })} />}
          <Select
            label="Ordenar por"
            value={state.sort}
            onChange={(event) => update({ sort: event.target.value as TicketSort })}
            fieldClassName={styles.sort}
          >
            {ticketSortValues.map((sort) => (
              <option key={sort} value={sort}>
                {sortLabels[sort]}
              </option>
            ))}
          </Select>
        </div>

        <div className={styles.results}>
          <div className={styles.resultsInner}>
            <Results
              state={state}
              list={list}
              isStaff={isStaff}
              filtersActive={filtersActive}
              onClearFilters={clearFilters}
              onPageChange={(page) => setSearchParams(writeInboxState({ ...state, page }))}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

/** Valores representativos para el esqueleto y el error: solo fijan la altura de las tarjetas, nunca se muestran. */
const ghostMetrics: TicketMetrics = {
  open: 24,
  openedToday: 8,
  inProgress: 12,
  inProgressAssignedToMe: 4,
  // «↑ 100 % vs. ayer»: la comparación más larga habitual.
  resolvedToday: 8,
  resolvedYesterday: 4,
  firstResponseMinutes: 18,
  firstResponseTargetMinutes: 30,
  views: { all: 24, mine: 4, unassigned: 6, resolved: 10 },
}

/**
 * Las métricas ocupan siempre el mismo hueco: durante la carga o el error, las tarjetas reales van ocultas
 * (`visibility: hidden` las quita también de la lectura de pantalla) y fijan la altura; encima van el esqueleto o el
 * error, y lo de debajo no salta cuando llegan los datos.
 */
function MetricsSection({ query }: { query: ReturnType<typeof useTicketMetrics> }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const focusOnData = useRef(false)
  // Tras un reintento con éxito, el botón desaparece: el foco pasa a las métricas recién cargadas, no a `body`.
  useEffect(() => {
    if (query.data && focusOnData.current) {
      focusOnData.current = false
      rowRef.current?.focus()
    }
  }, [query.data])

  if (query.data) return <MetricsRow metrics={query.data} rowRef={rowRef} />
  if (!query.isError && !query.isPending) return null
  return (
    <div className={styles.metricsState}>
      <div className={styles.metricsGhost}>
        <MetricsRow metrics={ghostMetrics} ghost />
      </div>
      <div className={styles.metricsOverlay}>
        {query.isError ? (
          <Alert tone="red" title="No pudimos cargar las métricas de la bandeja">
            <Button
              variant="secondary"
              aria-label="Reintentar cargar las métricas de la bandeja"
              onClick={() => {
                focusOnData.current = true
                void query.refetch().then((result) => {
                  if (result.isError) focusOnData.current = false
                })
              }}
            >
              Reintentar
            </Button>
          </Alert>
        ) : (
          <Skeleton lines={3} label="Cargando métricas…" className={styles.metricsSkeleton} />
        )}
      </div>
    </div>
  )
}

function MetricsRow({
  metrics,
  ghost = false,
  rowRef,
}: {
  metrics: TicketMetrics
  ghost?: boolean
  rowRef?: RefObject<HTMLDivElement | null>
}) {
  const { resolvedToday, resolvedYesterday, firstResponseMinutes, firstResponseTargetMinutes } = metrics
  const change =
    resolvedYesterday > 0 ? Math.round(((resolvedToday - resolvedYesterday) / resolvedYesterday) * 100) : null
  // Con `ghost` las etiquetas van vacías: el esqueleto no debe duplicar ningún texto real.
  const label = (text: string) => (ghost ? '\u00a0' : text)
  return (
    <div
      ref={rowRef}
      className={styles.metrics}
      {...(ghost ? {} : { role: 'group', 'aria-label': 'Métricas de la bandeja', tabIndex: -1 })}
    >
      <Metric
        label={label('Tickets abiertos')}
        value={metrics.open}
        detail={`${metrics.openedToday} nuevos hoy`}
        trend={metrics.openedToday > 0 ? 'positive' : 'neutral'}
      />
      <Metric
        label={label('En progreso')}
        value={metrics.inProgress}
        detail={`${metrics.inProgressAssignedToMe} asignados a ti`}
        trend="positive"
      />
      <Metric
        label={label('Resueltos hoy')}
        value={resolvedToday}
        detail={
          change === null ? `Ayer: ${resolvedYesterday}` : `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)} % vs. ayer`
        }
        trend={change === null ? 'neutral' : change >= 0 ? 'positive' : 'negative'}
      />
      <Metric
        label={label('Primera respuesta')}
        value={firstResponseMinutes === null ? '—' : `${firstResponseMinutes} min`}
        detail={
          firstResponseMinutes === null
            ? 'Sin respuestas en 7 días'
            : firstResponseMinutes <= firstResponseTargetMinutes
              ? 'Dentro del objetivo'
              : `Objetivo: ${firstResponseTargetMinutes} min`
        }
        trend={
          firstResponseMinutes === null
            ? 'neutral'
            : firstResponseMinutes <= firstResponseTargetMinutes
              ? 'positive'
              : 'negative'
        }
      />
    </div>
  )
}

interface ResultsProps {
  state: InboxState
  list: ReturnType<typeof useTicketList>
  isStaff: boolean
  filtersActive: boolean
  onClearFilters: () => void
  onPageChange: (page: number) => void
}

function Results({ state, list, isStaff, filtersActive, onClearFilters, onPageChange }: ResultsProps) {
  if (list.isPending) {
    return (
      <div className={styles.loading}>
        <Skeleton lines={2} label="Cargando tickets…" />
        <Skeleton lines={2} label="" />
        <Skeleton lines={2} label="" />
      </div>
    )
  }
  if (list.isError) {
    return (
      <EmptyState
        kind="error"
        title="No pudimos cargar los tickets"
        description="Revisa tu conexión y vuelve a intentarlo."
        live={list.failureCount > 1}
        action={
          <Button variant="secondary" onClick={() => void list.refetch()}>
            Reintentar
          </Button>
        }
      />
    )
  }
  const page = list.data
  if (page.items.length === 0) {
    if (filtersActive || state.view !== 'all') {
      return (
        <EmptyState
          kind="noResults"
          title="No encontramos tickets"
          description={filtersActive ? 'Prueba otra búsqueda o quita los filtros.' : 'No hay tickets en esta vista.'}
          action={
            filtersActive && (
              <Button variant="secondary" onClick={onClearFilters}>
                Limpiar filtros
              </Button>
            )
          }
        />
      )
    }
    return (
      <EmptyState
        title="Todavía no hay tickets"
        description={isStaff ? 'Crea la primera solicitud para empezar.' : 'Cuando abras una solicitud aparecerá aquí.'}
        action={
          isStaff && (
            <Link to="/tickets/nuevo" className={buttonClassName()}>
              Crear ticket
            </Link>
          )
        }
      />
    )
  }
  return (
    <>
      <p className="visually-hidden" role="status">
        {page.totalItems === 1 ? '1 ticket' : `${page.totalItems} tickets`}
      </p>
      <TicketTable label="Tickets">
        {page.items.map((ticket) => (
          <InboxRow key={ticket.id} ticket={ticket} isStaff={isStaff} />
        ))}
      </TicketTable>
      <Pagination page={page.page + 1} pageSize={page.size} total={page.totalItems} onPageChange={onPageChange} />
    </>
  )
}

function InboxRow({ ticket, isStaff }: { ticket: TicketSummary; isStaff: boolean }) {
  const me = useMe()
  const timeZone = useTimeZone()
  const toast = useToast()
  const quickUpdate = useQuickTicketUpdate()

  function run(changes: TicketChanges, success: string) {
    // Una sola llamada: el reintento de un 503 de bloqueo la repite tal cual (con la versión que leyó la primera vez).
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

  const actions: MenuItem[] = isStaff
    ? [
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
    : []
  return <TicketRow ticket={ticket} to={`/tickets/${ticket.number}`} actions={actions} timeZone={timeZone} />
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
