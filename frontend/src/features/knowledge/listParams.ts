import type { ArticleStatus } from '../../domain/article'

/** Estado de la lista que vive en la URL, para poder compartirla y recargarla sin perder filtros. */
export interface ArticleListState {
  q: string
  /** Slug de la categoría. */
  category?: string
  /** Solo el personal filtra por estado; el servidor ignora el filtro de un cliente. */
  status?: ArticleStatus
  /** Página de la interfaz, desde 1. */
  page: number
}

export const articleStatusValues: readonly ArticleStatus[] = ['published', 'draft']

export function readArticleListState(params: URLSearchParams): ArticleListState {
  const page = Number.parseInt(params.get('page') ?? '', 10)
  return {
    q: params.get('q') ?? '',
    category: params.get('category') || undefined,
    status: articleStatusValues.find((status) => status === params.get('status')),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** Solo escribe lo que difiere del estado por defecto, para URLs cortas. */
export function writeArticleListState(state: ArticleListState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q.trim())
  if (state.category) params.set('category', state.category)
  if (state.status) params.set('status', state.status)
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

/** Filtros que el usuario puede quitar con «Limpiar filtros». */
export function hasActiveArticleFilters(state: ArticleListState): boolean {
  return Boolean(state.q.trim() || state.category || state.status)
}
