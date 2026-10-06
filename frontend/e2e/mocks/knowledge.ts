import type { Article, ArticleSummary, Category, Me } from '../../src/api/schema'
import { json, minutesAgo, problem, type MockFeature, type MockHandler, type MockRoute } from './shared'
import { me } from './session'

const acceso = { id: 'cat-acceso', name: 'Cuenta y acceso', slug: 'cuenta-y-acceso' }
const facturacion = { id: 'cat-facturacion', name: 'Facturación', slug: 'facturacion' }
const primerosPasos = { id: 'cat-pasos', name: 'Primeros pasos', slug: 'primeros-pasos' }

const articleSummary = (
  article: Pick<ArticleSummary, 'id' | 'slug' | 'title' | 'category'> & Partial<ArticleSummary>,
): ArticleSummary => ({
  status: 'published',
  visibility: 'public',
  updatedAt: minutesAgo(60 * 24 * 3),
  publishedAt: minutesAgo(60 * 24 * 3),
  ...article,
})

/** Artículos de demostración con el contrato de lista (`ArticleSummary`): los de Figma, con «Configurar notificaciones» en borrador. */
export const articles: ArticleSummary[] = [
  articleSummary({
    id: 'a-recuperar',
    slug: 'como-recuperar-el-acceso-a-tu-cuenta',
    title: 'Cómo recuperar el acceso a tu cuenta',
    category: acceso,
    updatedAt: minutesAgo(30),
  }),
  articleSummary({
    id: 'a-invitar',
    slug: 'invitar-a-tu-equipo',
    title: 'Invitar a tu equipo',
    category: primerosPasos,
    updatedAt: minutesAgo(60 * 24),
  }),
  articleSummary({
    id: 'a-factura',
    slug: 'descargar-una-factura',
    title: 'Descargar una factura',
    category: facturacion,
  }),
  articleSummary({
    id: 'a-notificaciones',
    slug: 'configurar-notificaciones',
    title: 'Configurar notificaciones',
    category: primerosPasos,
    status: 'draft',
    publishedAt: null,
  }),
  articleSummary({
    id: 'a-largo',
    slug: 'una-guia-extraordinariamente-larga',
    title:
      'Una guía extraordinariamente larga sobre cómo configurar cada una de las notificaciones de tu espacio de trabajo',
    category: primerosPasos,
    visibility: 'internal',
  }),
]

/** Cuerpo de demostración de los artículos: con encabezados `##` y `###` para el índice. */
const articleBody = (title: string) =>
  [
    `Esta guía explica: ${title.toLowerCase()}.`,
    '',
    '## Solicita un enlace nuevo',
    '',
    'Selecciona **Olvidé mi contraseña** e introduce el correo asociado a tu cuenta.',
    '',
    '### Revisa tu correo',
    '',
    'Busca el mensaje de recuperación. Si no aparece, revisa la carpeta de spam.',
    '',
    '## Recupera el acceso',
    '',
    '- Abre el enlace antes de que venza.',
    '- Sigue las instrucciones.',
  ].join('\n')

/** Artículos con cuerpo, versión y ETag como el servidor. Cada test crea el suyo; se comparte entre roles con `mockApi`. */
export type ArticleStore = Map<string, Article>

export function createArticleStore(): ArticleStore {
  return new Map(
    articles.map((summary) => [
      summary.slug,
      {
        ...summary,
        body: articleBody(summary.title),
        allowFeedback: true,
        version: 1,
        createdBy: me.user,
        updatedBy: me.user,
      },
    ]),
  )
}

/**
 * `role` es el de la sesión simulada. Para un cliente, `/knowledge/*` hace lo que el servidor: solo artículos
 * publicados y públicos, y sin las categorías que se quedan vacías.
 */
export function knowledgeMock(role: Me['role'], articleStore: ArticleStore = createArticleStore()): MockFeature {
  const readable = (article: ArticleSummary) =>
    role !== 'customer' || (article.status === 'published' && article.visibility === 'public')
  const articleJson = (route: MockRoute, article: Article, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { ETag: `"${article.version}"` },
      body: JSON.stringify(article),
    })
  const touch = (article: Article, changes: Partial<Article>): Article => {
    const next = { ...article, ...changes, version: article.version + 1, updatedAt: new Date().toISOString() }
    articleStore.set(next.slug, next)
    return next
  }
  const currentArticles = () => [...articleStore.values()]
  const knowledgeCategories = (): Category[] =>
    [acceso, facturacion, primerosPasos]
      .map((ref) => ({
        ...ref,
        description: `Descripción de ${ref.name}`,
        articles: currentArticles().filter((article) => readable(article) && article.category.id === ref.id).length,
      }))
      .filter((entry) => role !== 'customer' || entry.articles > 0)
  const categoryByIdFor = (id: string) => [acceso, facturacion, primerosPasos].find((ref) => ref.id === id)
  const handle: MockHandler = ({ route, request, url, path, method }) => {
    const articleMatch = path.match(/^\/knowledge\/articles\/([^/]+?)(\/publish|\/unpublish)?$/)

    if (method === 'GET' && path === '/knowledge/categories') return json(route, knowledgeCategories())
    if (method === 'GET' && path === '/knowledge/articles') {
      const q = url.searchParams.get('q')?.toLowerCase()
      const category = url.searchParams.get('category')
      const status = url.searchParams.get('status')
      const items = currentArticles().filter(
        (article) =>
          readable(article) &&
          (!category || article.category.slug === category) &&
          (!status || article.status === status) &&
          (!q || `${article.title} ${article.category.name}`.toLowerCase().includes(q)),
      )
      return json(route, { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 })
    }
    if (method === 'POST' && path === '/knowledge/articles') {
      if (role === 'customer') return problem(route, 403, 'Prohibido')
      const body = request.postDataJSON() as {
        title: string
        body: string
        categoryId: string
        visibility: Article['visibility']
        allowFeedback?: boolean
      }
      const slug = body.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      if (articleStore.has(slug)) return problem(route, 409, 'Conflicto')
      const category = categoryByIdFor(body.categoryId)
      if (!category) return problem(route, 400, 'Datos no válidos', [{ field: 'categoryId', message: 'No existe.' }])
      const created: Article = {
        id: `a-${slug}`,
        slug,
        title: body.title,
        category,
        status: 'draft',
        visibility: body.visibility,
        updatedAt: new Date().toISOString(),
        publishedAt: null,
        body: body.body,
        allowFeedback: body.allowFeedback ?? true,
        version: 0,
        createdBy: me.user,
        updatedBy: me.user,
      }
      articleStore.set(slug, created)
      return articleJson(route, created, 201)
    }
    if (articleMatch) {
      const article = articleStore.get(articleMatch[1]!)
      // Un cliente no distingue un artículo que no existe de uno que no puede leer.
      if (!article || !readable(article)) return problem(route, 404, 'No encontrado')
      if (method === 'GET') return articleJson(route, article)
      if (role === 'customer') return problem(route, 403, 'Prohibido')
      if (method === 'PATCH') {
        const ifMatch = request.headers()['if-match']
        if (!ifMatch) return problem(route, 428, 'Se requiere If-Match')
        if (ifMatch !== `"${article.version}"`) return problem(route, 412, 'El recurso cambió')
        const { categoryId, ...changes } = request.postDataJSON() as Partial<Article> & { categoryId?: string }
        const category = categoryId ? categoryByIdFor(categoryId) : undefined
        return articleJson(route, touch(article, { ...changes, ...(category && { category }) }))
      }
      if (method === 'POST' && articleMatch[2]) {
        const publishing = articleMatch[2] === '/publish'
        if ((article.status === 'published') === publishing) return problem(route, 409, 'Conflicto de estado')
        return articleJson(
          route,
          touch(article, {
            status: publishing ? 'published' : 'draft',
            publishedAt: publishing ? new Date().toISOString() : null,
          }),
        )
      }
    }
    return undefined
  }
  return { handle }
}
