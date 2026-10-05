import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, toApiPage, unwrap } from '../../api/client'
import type { ArticleStatus } from '../../domain/article'

export interface ArticleListParams {
  q?: string
  /** Slug de la categoría. */
  category?: string
  status?: ArticleStatus
  /** Página de la interfaz, desde 1. */
  page: number
  pageSize: number
  sort?: string
}

export const articleKeys = {
  all: ['articles'] as const,
  lists: () => [...articleKeys.all, 'list'] as const,
  list: (params: ArticleListParams) => [...articleKeys.lists(), params] as const,
  detail: (slug: string) => [...articleKeys.all, 'detail', slug] as const,
  categories: () => [...articleKeys.all, 'categories'] as const,
}

export function useArticleList(params: ArticleListParams) {
  return useQuery({
    queryKey: articleKeys.list(params),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/knowledge/articles', {
          params: {
            query: {
              q: params.q?.trim() || undefined,
              category: params.category || undefined,
              status: params.status,
              page: toApiPage(params.page),
              size: params.pageSize,
              sort: params.sort,
            },
          },
          signal,
        }),
      ),
    // Mantiene la página anterior mientras llega la siguiente, sin parpadeos al filtrar o paginar.
    placeholderData: keepPreviousData,
  })
}

/** Categorías con los artículos que quien llama puede leer: un cliente no recibe las que no tienen ninguno. */
export function useCategories() {
  return useQuery({
    queryKey: articleKeys.categories(),
    queryFn: ({ signal }) => unwrap(api.GET('/knowledge/categories', { signal })),
  })
}
