import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import {
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
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
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
  'updatedAt,desc': 'Actualización: más reciente primero',
  'updatedAt,asc': 'Actualización: más antigua primero',
  'createdAt,desc': 'Creación: más reciente primero',
  'createdAt,asc': 'Creación: más antigua primero',
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

      {isStaff && metrics.data && <MetricsRow metrics={metrics.data} />}

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

function MetricsRow({ metrics }: { metrics: TicketMetrics }) {
  const { resolvedToday, resolvedYesterday, firstResponseMinutes, firstResponseTargetMinutes } = metrics
  const change =
    resolvedYesterday > 0 ? Math.round(((resolvedToday - resolvedYesterday) / resolvedYesterday) * 100) : null
  return (
    <div className={styles.metrics}>
      <Metric
        label="Tickets abiertos"
        value={metrics.open}
        detail={`${metrics.openedToday} nuevos hoy`}
        trend={metrics.openedToday > 0 ? 'positive' : 'neutral'}
      />
      <Metric
        label="En progreso"
        value={metrics.inProgress}
        detail={`${metrics.inProgressAssignedToMe} asignados a ti`}
        trend="positive"
      />
      <Metric
        label="Resueltos hoy"
        value={resolvedToday}
        detail={
          change === null ? `Ayer: ${resolvedYesterday}` : `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)} % vs. ayer`
        }
        trend={change === null ? 'neutral' : change >= 0 ? 'positive' : 'negative'}
      />
      <Metric
        label="Primera respuesta"
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
  const toast = useToast()
  const quickUpdate = useQuickTicketUpdate()

  function run(changes: TicketChanges, success: string) {
    quickUpdate.mutate(
      { number: ticket.number, changes },
      {
        onSuccess: () => toast.show({ title: success }),
        onError: (error) =>
          toast.show({
            tone: 'error',
            title: `No se pudo actualizar el ticket #${ticket.number}`,
            description: isApiError(error, 412)
              ? 'Otra persona lo cambió a la vez. Revisa los cambios e inténtalo de nuevo.'
              : 'Inténtalo de nuevo en unos segundos.',
          }),
      },
    )
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
  return <TicketRow ticket={ticket} to={`/tickets/${ticket.number}`} actions={actions} />
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
