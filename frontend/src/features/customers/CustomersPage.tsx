import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useSearchParams, type To } from 'react-router'
import {
  Button,
  buttonClassName,
  EmptyState,
  FilterChip,
  Icon,
  Menu,
  Pagination,
  SearchField,
  Select,
  type MenuItem,
} from '../../components/ui'
import { isApiError } from '../../api/client'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { useRetryFocus } from '../overview/useRetryFocus'
import { useTimeZone } from '../session/useTimeZone'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { CustomersDirectory, CustomersDirectorySkeleton, type DirectoryCard } from './CustomersDirectory'
import { customersSummary, groupSummary, viewAllLabel } from './directory'
import {
  customerSortValues,
  forCompany,
  hasActiveCustomerFilters,
  isCompanyView,
  readCustomerListState,
  type CustomerGrouping,
  type CustomerListState,
  type CustomerSort,
  withoutCompanyFilter,
  writeCustomerListState,
} from './listParams'
import { useCompanies, useCustomerGroups, useCustomerList, useCustomerMetrics } from './queries'
import styles from './CustomersPage.module.css'

/** Clientes por página en la lista plana y empresas por página en la agrupada. */
const PAGE_SIZE = 20
const GROUPS_PAGE_SIZE = 8
/** Valor de la opción «Sin empresa» del filtro; ninguna empresa real se llama así en la URL. */
const NO_COMPANY = '__sin-empresa__'

const sortLabels: Record<CustomerSort, string> = {
  'name,asc': 'Nombre: A–Z',
  'name,desc': 'Nombre: Z–A',
  'createdAt,desc': 'Alta: más reciente',
  'createdAt,asc': 'Alta: más antigua',
  'openTickets,desc': 'Tickets abiertos: más primero',
  'openTickets,asc': 'Tickets abiertos: menos primero',
}

const groupingLabels: Record<CustomerGrouping, string> = {
  company: 'Empresa',
  none: 'Sin agrupar',
}

/** Directorio de clientes del personal. La guardia de rol la pone la ruta (`sectionRoute`). */
export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // El alta se abre sobre la lista y conserva su búsqueda y filtros al cerrarse.
  const location = useLocation()
  const newCustomerTo: To = { pathname: '/clientes/nuevo', search: location.search }
  const newCustomerLink = useRef<HTMLAnchorElement>(null)
  const dialogOpen = location.pathname === '/clientes/nuevo'
  const dialogWasOpen = useRef(dialogOpen)
  // Al cerrar el alta el shell mueve el foco al contenido tras cada cambio de ruta: se devuelve al botón que la abrió
  // después de ese salto, en la siguiente tarea.
  useEffect(() => {
    const closed = dialogWasOpen.current && !dialogOpen
    dialogWasOpen.current = dialogOpen
    if (!closed) return
    const timer = setTimeout(() => newCustomerLink.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [dialogOpen])
  const state = readCustomerListState(searchParams)
  const [searchText, setSearchText] = useState(state.q)
  const debouncedSearch = useDebouncedValue(searchText)

  const update = (changes: Partial<CustomerListState>) =>
    setSearchParams(writeCustomerListState({ ...state, page: 1, ...changes }), { replace: true })

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

  // La agrupación solo cambia cómo se pide la página: por empresas, o plana (sin agrupar o con una empresa elegida).
  const flatView = state.group === 'none' || isCompanyView(state)
  const flat = useCustomerList(
    {
      q: state.q,
      company: state.company,
      withoutCompany: state.withoutCompany,
      archived: state.archived,
      sort: state.sort,
      page: state.page,
      pageSize: PAGE_SIZE,
    },
    flatView,
  )
  const groups = useCustomerGroups(
    { q: state.q, archived: state.archived, sort: state.sort, page: state.page, pageSize: GROUPS_PAGE_SIZE },
    !flatView,
  )
  const list = flatView ? flat : groups
  const metrics = useCustomerMetrics()
  const companies = useCompanies()
  const timeZone = useTimeZone()
  const summaryFocus = useRetryFocus<HTMLSpanElement>(metrics.isSuccess)
  const listFocus = useRetryFocus<HTMLDivElement>(list.isSuccess)
  const companiesFocus = useRetryFocus<HTMLSelectElement>(companies.isSuccess)

  const filtersActive = hasActiveCustomerFilters(state)
  const clearFilters = () => {
    setSearchText('')
    update({ q: '', company: undefined, withoutCompany: false, archived: false })
  }
  // Una empresa que llega en la URL sin estar en la lista (p. ej. sin clientes activos) sigue siendo una opción.
  const companyOptions = [...(companies.data ?? [])]
  if (state.company && !companyOptions.includes(state.company)) companyOptions.push(state.company)
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Clientes"
        description={<Summary metrics={metrics} focus={summaryFocus} />}
        actions={
          <Link ref={newCustomerLink} to={newCustomerTo} className={buttonClassName()}>
            <Icon name="plus" />
            Nuevo cliente
          </Link>
        }
      />

      <section className={styles.filters} aria-label="Buscar y filtrar clientes">
        <SearchField
          label="Buscar clientes"
          placeholder="Nombre, empresa o correo…"
          value={searchText}
          onValueChange={setSearchText}
          fieldClassName={styles.search}
        />
        <Select
          ref={companiesFocus.ref}
          label="Empresa del cliente"
          value={state.withoutCompany ? NO_COMPANY : (state.company ?? '')}
          onChange={(event) => {
            const value = event.target.value
            update({ company: value && value !== NO_COMPANY ? value : undefined, withoutCompany: value === NO_COMPANY })
          }}
          fieldClassName={styles.select}
          hint={
            companies.isError ? (
              <>
                No pudimos cargar las empresas.{' '}
                <button
                  type="button"
                  className={styles.retry}
                  aria-label="Reintentar cargar las empresas"
                  onClick={() => companiesFocus.retry(companies.refetch)}
                >
                  Reintentar
                </button>
              </>
            ) : undefined
          }
        >
          <option value="">Todas</option>
          <option value={NO_COMPANY}>Sin empresa</option>
          {companyOptions.map((company) => (
            <option key={company} value={company}>
              {company}
            </option>
          ))}
        </Select>
        <Select
          label="Ordenar por"
          value={state.sort}
          onChange={(event) => update({ sort: event.target.value as CustomerSort })}
          fieldClassName={styles.select}
        >
          {customerSortValues.map((sort) => (
            <option key={sort} value={sort}>
              {sortLabels[sort]}
            </option>
          ))}
        </Select>
        <Select
          label="Agrupar"
          value={state.group}
          // Página 2 de empresas no es página 2 de clientes: al cambiar de agrupación se vuelve a la primera.
          onChange={(event) => update({ group: event.target.value as CustomerGrouping })}
          fieldClassName={styles.select}
        >
          {(Object.keys(groupingLabels) as CustomerGrouping[]).map((group) => (
            <option key={group} value={group}>
              {groupingLabels[group]}
            </option>
          ))}
        </Select>
        <ArchivedFilter archived={state.archived} onChange={(archived) => update({ archived })} />
        {isCompanyView(state) && (
          <button
            type="button"
            className={styles.chip}
            aria-label={`Quitar el filtro Empresa del cliente: ${state.company ?? 'Sin empresa'}`}
            onClick={() => setSearchParams(writeCustomerListState(withoutCompanyFilter(state)), { replace: true })}
          >
            <span className={styles.chipText}>Empresa del cliente: {state.company ?? 'Sin empresa'}</span>
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </section>

      <div ref={listFocus.ref} className={styles.results} role="region" aria-label="Lista de clientes" tabIndex={-1}>
        <Results
          state={state}
          flatView={flatView}
          flat={flat}
          groups={groups}
          filtersActive={filtersActive}
          newCustomerTo={newCustomerTo}
          timeZone={timeZone}
          onClearFilters={clearFilters}
          onRetry={() => listFocus.retry(list.refetch)}
          onPageChange={(page) => setSearchParams(writeCustomerListState({ ...state, page }))}
          onOpenCompany={(company) => setSearchParams(writeCustomerListState(forCompany(state, company)))}
          backTo={{ search: writeCustomerListState(withoutCompanyFilter(state)).toString() }}
        />
      </div>
      <Outlet />
    </div>
  )
}

/** Línea bajo el título con los datos que antes daban las métricas; reserva su línea mientras carga. */
function Summary({
  metrics,
  focus,
}: {
  metrics: ReturnType<typeof useCustomerMetrics>
  focus: ReturnType<typeof useRetryFocus<HTMLSpanElement>>
}) {
  if (metrics.isPending) {
    return (
      <>
        {/* Mide lo que medirá la frase real, así la página no salta al llegar el resumen. */}
        <span className={styles.summaryPlaceholder} aria-hidden="true">
          {customersSummary({ total: 100, companies: 10, withOpenTickets: 10, newThisMonth: 10 })}
        </span>
        <span className="visually-hidden" role="status">
          Cargando el resumen…
        </span>
      </>
    )
  }
  if (metrics.isError) {
    // Sin permisos no hay resumen que reintentar: lo dice la lista.
    if (isApiError(metrics.error, 403)) return null
    return (
      <>
        No pudimos cargar el resumen.{' '}
        <button
          type="button"
          className={styles.retry}
          aria-label="Reintentar cargar el resumen"
          onClick={() => focus.retry(metrics.refetch)}
        >
          Reintentar
        </button>
      </>
    )
  }
  // Texto al que va el foco tras un reintento con éxito.
  return (
    <span ref={focus.ref} tabIndex={-1} className={styles.summary}>
      {customersSummary(metrics.data)}
    </span>
  )
}

function ArchivedFilter({ archived, onChange }: { archived: boolean; onChange: (archived: boolean) => void }) {
  const items: MenuItem[] = [
    { id: 'active', label: 'Activos', onSelect: () => onChange(false) },
    { id: 'archived', label: 'Archivados', onSelect: () => onChange(true) },
  ]
  return (
    <Menu label="Filtrar por estado" items={items} placement="bottom-start">
      {(trigger) => (
        <FilterChip selected={archived} {...trigger}>
          {archived ? 'Estado: Archivados' : 'Estado'}
        </FilterChip>
      )}
    </Menu>
  )
}

interface ResultsProps {
  state: CustomerListState
  flatView: boolean
  flat: ReturnType<typeof useCustomerList>
  groups: ReturnType<typeof useCustomerGroups>
  filtersActive: boolean
  newCustomerTo: To
  timeZone: string
  onClearFilters: () => void
  onRetry: () => void
  onPageChange: (page: number) => void
  onOpenCompany: (company: string | null) => void
  /** Destino de «Volver a todas las empresas»: la misma lista sin el filtro de empresa. */
  backTo: To
}

function Results({
  state,
  flatView,
  flat,
  groups,
  filtersActive,
  newCustomerTo,
  timeZone,
  onClearFilters,
  onRetry,
  onPageChange,
  backTo,
}: ResultsProps) {
  const list = flatView ? flat : groups
  if (list.isPending) return <CustomersDirectorySkeleton label="Cargando clientes…" />
  if (list.isError) {
    if (isApiError(list.error, 403)) {
      return (
        <EmptyState
          className={styles.state}
          kind="restricted"
          title="No tienes acceso a los clientes"
          description="Tu rol no permite ver esta lista. Pide acceso a quien administra tu equipo."
        />
      )
    }
    return (
      <EmptyState
        className={styles.state}
        kind="error"
        title="No pudimos cargar los clientes"
        description="Revisa tu conexión y vuelve a intentarlo."
        live={list.failureCount > 1}
        action={
          <Button variant="secondary" aria-label="Reintentar cargar los clientes" onClick={onRetry}>
            Reintentar
          </Button>
        }
      />
    )
  }
  const page = list.data
  if (page.items.length === 0) {
    if (state.page > 1 && page.totalItems > 0) {
      return (
        <EmptyState
          className={styles.state}
          kind="noResults"
          title="Esta página ya no existe"
          description={flatView ? 'Hay menos clientes que antes.' : 'Hay menos empresas que antes.'}
          action={
            <Button variant="secondary" onClick={() => onPageChange(1)}>
              Ir a la primera página
            </Button>
          }
        />
      )
    }
    if (filtersActive) {
      return (
        <EmptyState
          className={styles.state}
          kind="noResults"
          title="No encontramos clientes"
          description={
            state.archived && !state.q.trim() && !isCompanyView(state)
              ? 'No hay clientes archivados.'
              : 'Prueba otra búsqueda o quita los filtros.'
          }
          action={
            <Button variant="secondary" onClick={onClearFilters}>
              Limpiar filtros
            </Button>
          }
        />
      )
    }
    return (
      <EmptyState
        className={styles.state}
        icon="clients"
        title="Todavía no hay clientes"
        description="Añade al primero para ver aquí su historial de tickets."
        action={
          <Link to={newCustomerTo} className={buttonClassName()}>
            Nuevo cliente
          </Link>
        }
      />
    )
  }
  const companyView = isCompanyView(state)
  let cards: DirectoryCard[]
  if (!flatView) {
    cards = groups.data!.items.map((group) => ({
      key: group.company ?? 'sin-empresa',
      company: { name: group.company, summary: groupSummary(group.customerCount, group.openTickets) },
      customers: group.customers,
      // Solo se ven los primeros: el resto se abre en la misma página, filtrando por la empresa.
      more:
        group.customerCount > group.customers.length
          ? {
              label: viewAllLabel(group.customerCount, group.company),
              to: { search: writeCustomerListState(forCompany(state, group.company)).toString() },
            }
          : undefined,
    }))
  } else {
    const customers = flat.data!.items
    cards = [
      {
        key: 'lista',
        company:
          state.group === 'company' && companyView
            ? { name: state.company ?? null, summary: groupSummary(page.totalItems) }
            : undefined,
        customers,
        showCompany: !(state.group === 'company' && companyView),
      },
    ]
  }
  return (
    <>
      <p className="visually-hidden" role="status">
        {flatView
          ? page.totalItems === 1
            ? '1 cliente'
            : `${page.totalItems} clientes`
          : page.totalItems === 1
            ? '1 empresa'
            : `${page.totalItems} empresas`}
      </p>
      <div aria-busy={list.isPlaceholderData}>
        <CustomersDirectory cards={cards} label={flatView ? 'Clientes' : 'Clientes por empresa'} timeZone={timeZone} />
      </div>
      {companyView && (
        <Link to={backTo} className={styles.back}>
          ← Volver a todas las empresas
        </Link>
      )}
      <Pagination
        page={page.page + 1}
        pageSize={page.size}
        total={page.totalItems}
        onPageChange={onPageChange}
        unit={flatView ? undefined : { one: 'empresa', many: 'empresas' }}
      />
    </>
  )
}
