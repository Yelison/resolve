import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Button, buttonClassName, EmptyState, Icon, Pagination } from '../../components/ui'
import { isApiError } from '../../api/client'
import type { ArticleStatus } from '../../domain/article'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
import { useTimeZone } from '../session/useTimeZone'
import { ArticleCard, ArticleCardSkeleton } from './ArticleCard'
import { CategoryCard, CategoryCardSkeleton } from './CategoryCard'
import { categoryTones } from './categoryTones'
import { KnowledgeHero } from './KnowledgeHero'
import {
  hasActiveArticleFilters,
  readArticleListState,
  writeArticleListState,
  type ArticleListState,
} from './listParams'
import { useArticleCount, useArticleList, useCategories } from './queries'
import { StatusPills } from './StatusPills'
import styles from './KnowledgePage.module.css'

const PAGE_SIZE = 10

/** Categorías visibles antes de «Ver las N categorías»: las de más artículos. */
const VISIBLE_CATEGORIES = 6

/**
 * Donde un cliente abre una solicitud. La creación de tickets es hoy solo del personal (`/tickets/nuevo`), así que el
 * enlace lleva a la lista de sus tickets; cuando los clientes puedan crear, solo cambia esta constante.
 */
const REQUEST_PATH = '/tickets'

/** Tarjetas de carga: lo que cabe en la primera pantalla sin saber cuántas habrá. */
const CATEGORY_PLACEHOLDERS = 3
const ARTICLE_PLACEHOLDERS = 4

/**
 * Centro de ayuda de la base de conocimiento. La ve todo el mundo: el servidor solo entrega a un cliente los
 * artículos publicados y públicos, y la interfaz no muestra al cliente el estado ni la acción de crear.
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

  const list = useArticleList({
    q: state.q,
    category: state.category,
    status: state.status,
    page: state.page,
    pageSize: PAGE_SIZE,
  })
  const categories = useCategories()
  // Los recuentos de las píldoras siguen la búsqueda y la categoría, no el estado: cada uno es lo que daría pulsarla.
  const counted = { q: state.q, category: state.category }
  const published = useArticleCount({ ...counted, status: 'published' }, isStaff)
  const drafts = useArticleCount({ ...counted, status: 'draft' }, isStaff)

  const clearFilters = () => {
    setSearchText('')
    update({ q: '', category: undefined, status: undefined })
  }
  // El botón «Buscar» adelanta el envío del texto actual sin esperar al debounce.
  const submitSearch = () => {
    pushedSearch.current = searchText.trim()
    update({ q: searchText })
  }
  const categoryFilter = (slug: string) => {
    const search = writeArticleListState({ ...state, page: 1, category: state.category === slug ? undefined : slug })
    return { search: search.size > 0 ? `?${search}` : '' }
  }

  // El total sale de las categorías: es lo que quien consulta puede leer y no cambia con la búsqueda.
  const articleCount = categories.isPending
    ? undefined
    : categories.isError
      ? null
      : categories.data.reduce((total, category) => total + category.articles, 0)
  const hideCategories = !isStaff && categories.isSuccess && categories.data.length === 0

  return (
    <div className={pageStyles.page}>
      <KnowledgeHero
        audience={isStaff ? 'staff' : 'customer'}
        articleCount={articleCount}
        value={searchText}
        onValueChange={setSearchText}
        onSubmit={submitSearch}
      />

      {!hideCategories && (
        <section className={styles.section} aria-labelledby="kb-categories">
          <div className={styles.sectionHeader}>
            <h2 id="kb-categories" className={styles.sectionTitle}>
              {isStaff ? 'Categorías' : 'Temas'}
            </h2>
            {isStaff && (
              <Link to="/conocimiento/nuevo" className={buttonClassName()}>
                <Icon name="plus" />
                Nuevo artículo
              </Link>
            )}
          </div>
          <Categories
            isStaff={isStaff}
            categories={categories}
            selected={state.category}
            filterFor={categoryFilter}
            expanded={Boolean(state.allCategories)}
            onExpandedChange={(allCategories) =>
              update({ allCategories: allCategories || undefined, page: state.page })
            }
          />
        </section>
      )}

      <section className={styles.section} aria-labelledby="kb-articles">
        <div className={styles.sectionHeader}>
          <h2 id="kb-articles" className={styles.sectionTitle}>
            {isStaff ? 'Artículos' : 'Artículos más recientes'}
          </h2>
          {!isStaff && (
            <Link to={REQUEST_PATH} className={buttonClassName({ variant: 'secondary' })}>
              ¿No lo encuentras? Abre una solicitud
            </Link>
          )}
          {isStaff && (
            <StatusPills
              status={state.status}
              counts={{ published: published.data, draft: drafts.data }}
              onChange={(status: ArticleStatus | undefined) => update({ status })}
            />
          )}
        </div>
        <Results
          state={state}
          list={list}
          isStaff={isStaff}
          timeZone={timeZone}
          onClearFilters={clearFilters}
          onPageChange={(page) => setSearchParams(writeArticleListState({ ...state, page }))}
        />
      </section>
    </div>
  )
}

function Categories({
  isStaff,
  categories,
  selected,
  filterFor,
  expanded,
  onExpandedChange,
}: {
  isStaff: boolean
  categories: ReturnType<typeof useCategories>
  selected: string | undefined
  filterFor: (slug: string) => { search: string }
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  if (categories.isPending) {
    return (
      <div role="status">
        <span className="visually-hidden">{isStaff ? 'Cargando categorías…' : 'Cargando temas…'}</span>
        <ul className={styles.categories} aria-hidden="true">
          {Array.from({ length: CATEGORY_PLACEHOLDERS }, (_, index) => (
            <li key={index}>
              <CategoryCardSkeleton />
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (categories.isError) {
    return (
      <Alert tone="red" title={isStaff ? 'No pudimos cargar las categorías' : 'No pudimos cargar los temas'}>
        <Button
          variant="secondary"
          aria-label={isStaff ? 'Reintentar cargar las categorías' : 'Reintentar cargar los temas'}
          onClick={() => void categories.refetch()}
        >
          Reintentar
        </Button>
      </Alert>
    )
  }
  if (categories.data.length === 0) return null
  // Las de más artículos primero; a igualdad, el orden alfabético que ya trae el servidor.
  const ranked = categories.data
    .map((category, index) => ({ category, tone: categoryTones[index % categoryTones.length]! }))
    .sort((a, b) => b.category.articles - a.category.articles)
  const collapsible = ranked.length > VISIBLE_CATEGORIES
  const visible = collapsible && !expanded ? ranked.slice(0, VISIBLE_CATEGORIES) : ranked
  // Una categoría filtrada que quedaría fuera del recorte se mantiene a la vista: es el filtro activo.
  const selectedHidden = selected !== undefined && !visible.some(({ category }) => category.slug === selected)
  const shown = selectedHidden
    ? [...visible.slice(0, VISIBLE_CATEGORIES - 1), ...ranked.filter(({ category }) => category.slug === selected)]
    : visible
  return (
    <>
      <ul id="kb-category-list" className={styles.categories}>
        {shown.map(({ category, tone }) => (
          <li key={category.id}>
            <CategoryCard
              category={category}
              tone={tone}
              to={filterFor(category.slug)}
              selected={category.slug === selected}
            />
          </li>
        ))}
      </ul>
      {collapsible && (
        <Button
          variant="secondary"
          className={styles.more}
          aria-expanded={expanded}
          aria-controls="kb-category-list"
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? 'Ver menos' : isStaff ? `Ver las ${ranked.length} categorías` : `Ver los ${ranked.length} temas`}
        </Button>
      )}
    </>
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
      <div role="status">
        <span className="visually-hidden">Cargando artículos…</span>
        <ul className={styles.articles} aria-hidden="true">
          {Array.from({ length: ARTICLE_PLACEHOLDERS }, (_, index) => (
            <li key={index}>
              <ArticleCardSkeleton />
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (list.isError) {
    if (isApiError(list.error, 403)) {
      return (
        <EmptyState
          kind="restricted"
          title="No tienes acceso a estos artículos"
          description="Tu rol no permite consultarlos. Si crees que es un error, pide acceso a quien administra tu espacio."
        />
      )
    }
    return (
      <EmptyState
        kind="error"
        title="No pudimos cargar los artículos"
        description="Revisa tu conexión y vuelve a intentarlo."
        live={list.failureCount > 1}
        action={
          <Button variant="secondary" aria-label="Reintentar cargar los artículos" onClick={() => void list.refetch()}>
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
      <ul className={styles.articles}>
        {page.items.map((article) => (
          <li key={article.id}>
            <ArticleCard article={article} timeZone={timeZone} showStatus={isStaff} />
          </li>
        ))}
      </ul>
      <Pagination page={page.page + 1} pageSize={page.size} total={page.totalItems} onPageChange={onPageChange} />
    </>
  )
}
