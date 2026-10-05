import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
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
  type MenuItem,
} from '../../components/ui'
import type { CustomerMetrics } from '../../domain/customer'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { CustomersTable } from './CustomersTable'
import {
  customerSortValues,
  hasActiveCustomerFilters,
  readCustomerListState,
  writeCustomerListState,
  type CustomerListState,
  type CustomerSort,
} from './listParams'
import { useCompanies, useCustomerList, useCustomerMetrics } from './queries'
import styles from './CustomersPage.module.css'

const PAGE_SIZE = 20

const sortLabels: Record<CustomerSort, string> = {
  'name,asc': 'Nombre: A–Z',
  'name,desc': 'Nombre: Z–A',
  'createdAt,desc': 'Alta: más reciente',
  'createdAt,asc': 'Alta: más antigua',
  'openTickets,desc': 'Tickets abiertos: más primero',
  'openTickets,asc': 'Tickets abiertos: menos primero',
}

/** Lista de clientes del personal. La guardia de rol la pone la ruta (`sectionRoute`). */
export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
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

  const list = useCustomerList({ ...state, pageSize: PAGE_SIZE })
  const metrics = useCustomerMetrics()
  const companies = useCompanies()

  const filtersActive = hasActiveCustomerFilters(state)
  const clearFilters = () => {
    setSearchText('')
    update({ q: '', company: undefined, archived: false })
  }
  // Una empresa que llega en la URL sin estar en la lista (p. ej. sin clientes activos) sigue siendo una opción.
  const companyOptions = [...(companies.data ?? [])]
  if (state.company && !companyOptions.includes(state.company)) companyOptions.push(state.company)
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Clientes"
        description="El contexto que tu equipo necesita para ayudar mejor."
        actions={
          <Link to="/clientes/nuevo" className={buttonClassName()}>
            <Icon name="plus" />
            Nuevo cliente
          </Link>
        }
      />

      {metrics.isPending ? (
        <div className={styles.metricsPlaceholder}>
          <Skeleton lines={2} label="Cargando métricas…" />
        </div>
      ) : (
        metrics.data && <MetricsRow metrics={metrics.data} />
      )}

      <section className={styles.panel} aria-label="Lista de clientes">
        <div className={styles.filters}>
          <SearchField
            label="Buscar clientes"
            placeholder="Buscar por nombre, empresa o correo…"
            value={searchText}
            onValueChange={setSearchText}
            fieldClassName={styles.search}
          />
          <Select
            label="Empresa"
            value={state.company ?? ''}
            onChange={(event) => update({ company: event.target.value || undefined })}
            fieldClassName={styles.select}
          >
            <option value="">Todas</option>
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
          <ArchivedFilter archived={state.archived} onChange={(archived) => update({ archived })} />
        </div>

        <div className={styles.results}>
          <Results
            state={state}
            list={list}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
            onPageChange={(page) => setSearchParams(writeCustomerListState({ ...state, page }))}
          />
        </div>
      </section>
    </div>
  )
}

function MetricsRow({ metrics }: { metrics: CustomerMetrics }) {
  return (
    <div className={styles.metrics}>
      <Metric label="Clientes activos" value={metrics.total} />
      <Metric label="Empresas" value={metrics.companies} />
      <Metric label="Con tickets abiertos" value={metrics.withOpenTickets} />
      <Metric label="Nuevos este mes" value={metrics.newThisMonth} />
    </div>
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
  list: ReturnType<typeof useCustomerList>
  filtersActive: boolean
  onClearFilters: () => void
  onPageChange: (page: number) => void
}

function Results({ state, list, filtersActive, onClearFilters, onPageChange }: ResultsProps) {
  if (list.isPending) {
    return (
      <div className={styles.loading}>
        <Skeleton lines={2} label="Cargando clientes…" />
        <Skeleton lines={2} label="" />
        <Skeleton lines={2} label="" />
      </div>
    )
  }
  if (list.isError) {
    return (
      <EmptyState
        kind="error"
        title="No pudimos cargar los clientes"
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
    if (filtersActive) {
      return (
        <EmptyState
          kind="noResults"
          title="No encontramos clientes"
          description={
            state.archived && !state.q.trim() && !state.company
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
    if (state.page > 1) {
      return (
        <EmptyState
          kind="noResults"
          title="Esta página ya no existe"
          description="Hay menos clientes que antes."
          action={
            <Button variant="secondary" onClick={() => onPageChange(1)}>
              Ir a la primera página
            </Button>
          }
        />
      )
    }
    return (
      <EmptyState
        icon="clients"
        title="Todavía no hay clientes"
        description="Añade al primero para ver aquí su historial de tickets."
        action={
          <Link to="/clientes/nuevo" className={buttonClassName()}>
            Nuevo cliente
          </Link>
        }
      />
    )
  }
  return (
    <>
      <p className="visually-hidden" role="status">
        {page.totalItems === 1 ? '1 cliente' : `${page.totalItems} clientes`}
      </p>
      <CustomersTable
        customers={page.items}
        caption={page.items.length === 1 ? 'Mostrando 1 resultado' : `Mostrando ${page.items.length} resultados`}
      />
      <Pagination page={page.page + 1} pageSize={page.size} total={page.totalItems} onPageChange={onPageChange} />
    </>
  )
}
