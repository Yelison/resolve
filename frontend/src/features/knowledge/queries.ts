import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, toApiPage, unwrap } from '../../api/client'
import type { Article, ArticleCreate, ArticlePatch, ArticleStatus } from '../../domain/article'

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

/** Detalle de un artículo por su slug. Un 404 también cubre un borrador que quien llama no puede ver. */
export function useArticle(slug: string) {
  return useQuery({
    queryKey: articleKeys.detail(slug),
    queryFn: ({ signal }) => unwrap(api.GET('/knowledge/articles/{slug}', { params: { path: { slug } }, signal })),
  })
}

/** Guarda en caché el artículo que devuelve una escritura, salvo que ya haya una versión más nueva. */
function writeArticleIfNewer(queryClient: QueryClient, article: Article) {
  const previous = queryClient.getQueryData<Article>(articleKeys.detail(article.slug))
  if (article.version >= (previous?.version ?? -1)) {
    queryClient.setQueryData(articleKeys.detail(article.slug), article)
  }
}

/** Lo que cambia en cualquier escritura: las listas y los contadores de las categorías. */
function invalidateArticleViews(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: articleKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: articleKeys.categories() })
}

/** Crea un borrador. Un 409 significa que otro artículo tomó el mismo slug a la vez. */
export function useCreateArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (article: ArticleCreate) => unwrap(api.POST('/knowledge/articles', { body: article })),
    onSuccess: (article: Article) => {
      queryClient.setQueryData(articleKeys.detail(article.slug), article)
      invalidateArticleViews(queryClient)
    },
  })
}

/**
 * Edita un artículo con If-Match y merge-patch: solo viajan los campos cambiados. Antes de enviar se cancela la
 * lectura en vuelo del detalle: si llegara después, pisaría la versión nueva. Un 412 recarga el detalle.
 */
export function useUpdateArticle(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: articleKeys.detail(slug), exact: true })
    },
    mutationFn: ({ version, changes }: { version: number; changes: ArticlePatch }) =>
      unwrap(
        api.PATCH('/knowledge/articles/{slug}', {
          params: { path: { slug }, header: { 'If-Match': `"${version}"` } },
          body: changes,
          headers: { 'Content-Type': 'application/merge-patch+json' },
        }),
      ),
    onSuccess: (article: Article) => {
      writeArticleIfNewer(queryClient, article)
      invalidateArticleViews(queryClient)
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: articleKeys.detail(slug), exact: true })
    },
  })
}

function useArticleStateChange(slug: string, request: () => Promise<Article>) {
  const queryClient = useQueryClient()
  return useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: articleKeys.detail(slug), exact: true })
    },
    mutationFn: request,
    onSuccess: (article: Article) => {
      writeArticleIfNewer(queryClient, article)
      invalidateArticleViews(queryClient)
    },
    // Un 409 significa que otra persona ya cambió el estado: se lee de nuevo para mostrar el real.
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: articleKeys.detail(slug), exact: true })
    },
  })
}

export function usePublishArticle(slug: string) {
  return useArticleStateChange(slug, () =>
    unwrap(api.POST('/knowledge/articles/{slug}/publish', { params: { path: { slug } } })),
  )
}

export function useUnpublishArticle(slug: string) {
  return useArticleStateChange(slug, () =>
    unwrap(api.POST('/knowledge/articles/{slug}/unpublish', { params: { path: { slug } } })),
  )
}
