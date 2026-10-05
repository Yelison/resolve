import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  Alert,
  Button,
  buttonClassName,
  EmptyState,
  FilterChip,
  Icon,
  Menu,
  Pagination,
  SearchField,
  Skeleton,
  type MenuItem,
} from '../../components/ui'
import type { ArticleStatus, Category } from '../../domain/article'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
import { useTimeZone } from '../session/useTimeZone'
import { ArticlesTable } from './ArticlesTable'
import { CategoryCard } from './CategoryCard'
import {
  hasActiveArticleFilters,
  readArticleListState,
  writeArticleListState,
  type ArticleListState,
} from './listParams'
import { useArticleList, useCategories } from './queries'
import styles from './KnowledgePage.module.css'

const PAGE_SIZE = 20

const statusLabels: Record<ArticleStatus, string> = { published: 'Publicados', draft: 'Borradores' }

/**
 * Lista de la base de conocimiento. La ve todo el mundo: el servidor solo entrega a un cliente los artículos
 * publicados y públicos, y la interfaz no muestra al cliente el estado ni la acción de crear.
 */
export function KnowledgePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const me = useMe()
  // Mientras no se sabe el rol se trata como cliente: nunca se enseña por un instante lo que solo ve el personal.
  const isStaff = me.data?.role === 'admin' || me.data?.role === 'agent'
  const timeZone = useTimeZone()
  const parsed = readArticleListState(searchParams)
  // El filtro de estado solo existe para el personal; un enlace con `status` no cambia lo que ve un cliente.
  const state: ArticleListState = { ...parsed, status: isStaff ? parsed.status : undefined }
  const [searchText, setSearchText] = useState(state.q)
  const debouncedSearch = useDebouncedValue(searchText)

  const update = (changes: Partial<ArticleListState>) =>
    setSearchParams(writeArticleListState({ ...state, page: 1, ...changes }), { replace: true })

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

  const list = useArticleList({ ...state, pageSize: PAGE_SIZE })
  const categories = useCategories()

  const clearFilters = () => {
    setSearchText('')
    update({ q: '', category: undefined, status: undefined })
  }
  const selectCategory = (category: Category) =>
    update({ category: state.category === category.slug ? undefined : category.slug })

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Base de conocimiento"
        description="Respuestas claras que ayudan a tus clientes y a tu equipo."
        actions={
          isStaff && (
            <Link to="/conocimiento/nuevo" className={buttonClassName()}>
              <Icon name="plus" />
              Nuevo artículo
            </Link>
          )
        }
      />

      <div className={styles.filters}>
        <SearchField
          label="Buscar artículos"
          placeholder="Buscar por título, contenido o categoría…"
          value={searchText}
          onValueChange={setSearchText}
          fieldClassName={styles.search}
        />
        {isStaff && <StatusFilter status={state.status} onChange={(status) => update({ status })} />}
      </div>

      <Categories categories={categories} selected={state.category} onSelect={selectCategory} />

      <section className={styles.panel} aria-label="Lista de artículos">
        <div className={styles.results}>
          <div className={styles.resultsInner}>
            <Results
              state={state}
              list={list}
              isStaff={isStaff}
              timeZone={timeZone}
              onClearFilters={clearFilters}
              onPageChange={(page) => setSearchParams(writeArticleListState({ ...state, page }))}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function StatusFilter({
  status,
  onChange,
}: {
  status: ArticleStatus | undefined
  onChange: (status: ArticleStatus | undefined) => void
}) {
  const items: MenuItem[] = [
    { id: 'all', label: 'Todos', onSelect: () => onChange(undefined) },
    { id: 'published', label: statusLabels.published, onSelect: () => onChange('published') },
    { id: 'draft', label: statusLabels.draft, onSelect: () => onChange('draft') },
  ]
  return (
    <Menu label="Filtrar por estado" items={items} placement="bottom-start">
      {(trigger) => (
        <FilterChip selected={status !== undefined} {...trigger}>
          {status ? `Estado: ${statusLabels[status]}` : 'Estado'}
        </FilterChip>
      )}
    </Menu>
  )
}

function Categories({
  categories,
  selected,
  onSelect,
}: {
  categories: ReturnType<typeof useCategories>
  selected: string | undefined
  onSelect: (category: Category) => void
}) {
  if (categories.isPending) {
    return (
      <div className={styles.categoriesPlaceholder}>
        <Skeleton lines={2} label="Cargando categorías…" />
      </div>
    )
  }
  if (categories.isError) {
    return (
      <Alert tone="red" title="No pudimos cargar las categorías">
        <Button
          variant="secondary"
          aria-label="Reintentar cargar las categorías"
          onClick={() => void categories.refetch()}
        >
          Reintentar
        </Button>
      </Alert>
    )
  }
  if (categories.data.length === 0) return null
  return (
    <ul className={styles.categories} aria-label="Categorías">
      {categories.data.map((category) => (
        <li key={category.id}>
          <CategoryCard category={category} selected={category.slug === selected} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  )
}

interface ResultsProps {
  state: ArticleListState
  list: ReturnType<typeof useArticleList>
  isStaff: boolean
  timeZone: string
  onClearFilters: () => void
  onPageChange: (page: number) => void
}

function Results({ state, list, isStaff, timeZone, onClearFilters, onPageChange }: ResultsProps) {
  if (list.isPending) {
    return (
      <div className={styles.loading}>
        <Skeleton lines={2} label="Cargando artículos…" />
        <Skeleton lines={2} label="" />
        <Skeleton lines={2} label="" />
      </div>
    )
  }
  if (list.isError) {
    return (
      <EmptyState
        kind="error"
        title="No pudimos cargar los artículos"
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
    if (state.page > 1 && page.totalItems > 0) {
      return (
        <EmptyState
          kind="noResults"
          title="Esta página ya no existe"
          description="Hay menos artículos que antes."
          action={
            <Button variant="secondary" onClick={() => onPageChange(1)}>
              Ir a la primera página
            </Button>
          }
        />
      )
    }
    if (hasActiveArticleFilters(state)) {
      return (
        <EmptyState
          kind="noResults"
          title="No encontramos artículos"
          description="Prueba otra búsqueda o quita los filtros."
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
        icon="book"
        title="Todavía no hay artículos"
        description={
          isStaff
            ? 'Escribe el primero para que tu equipo y tus clientes encuentren respuestas.'
            : 'Vuelve pronto: aún no se ha publicado ninguno.'
        }
        action={
          isStaff ? (
            <Link to="/conocimiento/nuevo" className={buttonClassName()}>
              Nuevo artículo
            </Link>
          ) : undefined
        }
      />
    )
  }
  return (
    <>
      <p className="visually-hidden" role="status">
        {page.totalItems === 1 ? '1 artículo' : `${page.totalItems} artículos`}
      </p>
      <ArticlesTable
        articles={page.items}
        showStatus={isStaff}
        timeZone={timeZone}
        caption={page.items.length === 1 ? 'Mostrando 1 resultado' : `Mostrando ${page.items.length} resultados`}
      />
      <Pagination page={page.page + 1} pageSize={page.size} total={page.totalItems} onPageChange={onPageChange} />
    </>
  )
}
