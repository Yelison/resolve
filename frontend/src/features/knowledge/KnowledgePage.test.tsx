import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { articlePage, articleSummary, category } from './articleFixtures'
import { KnowledgePage } from './KnowledgePage'

const categories = [
  category({ id: 'cat-factura', name: 'Facturación', slug: 'facturacion', description: 'Planes y pagos', articles: 6 }),
  category(),
  category({ id: 'cat-pasos', name: 'Primeros pasos', slug: 'primeros-pasos', description: null, articles: 1 }),
]

const draft = articleSummary({
  id: 'a-borrador',
  slug: 'configurar-notificaciones',
  title: 'Configurar notificaciones',
  status: 'draft',
  publishedAt: null,
})

const staffRoutes = {
  'GET /api/me': { body: adminMe },
  'GET /api/knowledge/categories': { body: categories },
}

function renderKnowledge(path = '/conocimiento') {
  return renderKnowledgeWithContainer(path).router
}

function renderKnowledgeWithContainer(path = '/conocimiento') {
  const router = createMemoryRouter([{ path: '/conocimiento', element: <KnowledgePage /> }], {
    initialEntries: [path],
  })
  const { container } = renderWithProviders(<RouterProvider router={router} />)
  return { router, container }
}

const requestsTo = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url)).filter((url) => url.pathname === path)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const manyCategories = Array.from({ length: 8 }, (_, index) =>
  category({
    id: `cat-${index}`,
    name: `Categoría ${index + 1}`,
    slug: `categoria-${index + 1}`,
    description: `Sobre el tema ${index + 1}`,
    articles: index + 1,
  }),
)

describe('KnowledgePage', () => {
  it('muestra esqueletos con forma de tarjeta mientras carga', () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/categories': () => new Promise(() => {}) as never,
      'GET /api/knowledge/articles': () => new Promise(() => {}) as never,
    })
    renderKnowledge()
    // Mientras /me carga se trata como cliente: «temas».
    expect(screen.getByText('Cargando temas…')).toBeInTheDocument()
    expect(screen.getByText('Cargando artículos…')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '¿En qué podemos ayudarte?' })).toBeInTheDocument()
  })

  it('el personal ve la cabecera, las categorías con su descripción, las tarjetas con extracto y las píldoras', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': (request) => {
        const status = new URL(request.url).searchParams.get('status')
        if (status === 'published') return { body: articlePage([articleSummary()], 4) }
        if (status === 'draft') return { body: articlePage([draft], 1) }
        return { body: articlePage([articleSummary(), draft]) }
      },
    })
    renderKnowledge()
    expect(await screen.findByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })).toHaveAttribute(
      'href',
      '/conocimiento/como-recuperar-el-acceso-a-tu-cuenta',
    )
    expect(screen.getByRole('heading', { level: 1, name: '¿Qué necesitas resolver?' })).toBeInTheDocument()
    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar artículos' })).toHaveAttribute(
      'placeholder',
      'Por ejemplo: recuperar contraseña',
    )
    // El número de la línea de apoyo suma lo que cuentan las categorías: 6 + 2 + 1.
    expect(screen.getByText(/Busca en los/)).toHaveTextContent('Busca en los 9 artículos de tu base de conocimiento')
    const facturacion = screen.getByRole('link', { name: /Facturación/ })
    expect(facturacion).toHaveTextContent('Planes y pagos')
    expect(facturacion).toHaveTextContent('6 artículos')
    expect(facturacion).toHaveAttribute('href', '/conocimiento?category=facturacion')
    expect(screen.getByRole('link', { name: /Primeros pasos/ })).toHaveTextContent('1 artículo')
    expect(screen.getAllByText('Si no puedes iniciar sesión, solicita un enlace nuevo.')).toHaveLength(2)
    expect(screen.getAllByText('Actualizado', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nuevo artículo/ })).toHaveAttribute('href', '/conocimiento/nuevo')
    expect(await screen.findByRole('button', { name: /Publicados\s*4/ })).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByRole('button', { name: /Borradores\s*1/ })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('el cliente ve «¿En qué podemos ayudarte?» y «Temas», sin acciones de personal ni botón de solicitud', async () => {
    mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/knowledge/categories': { body: manyCategories },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderKnowledge()
    expect(await screen.findByRole('heading', { level: 1, name: '¿En qué podemos ayudarte?' })).toBeInTheDocument()
    expect(screen.getByText('Busca una respuesta o empieza por un tema.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Temas' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Categorías' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Artículos más recientes' })).toBeInTheDocument()
    // Los clientes no crean tickets en esta versión: no hay llamada a abrir una solicitud.
    expect(screen.queryByText(/solicitud/i)).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Ver los 8 temas' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuevo artículo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filtrar por estado' })).not.toBeInTheDocument()
  })

  it('pide los artículos de diez en diez', async () => {
    const fetchSpy = mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderKnowledge()
    await screen.findByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })
    const sizes = requestsTo(fetchSpy, '/api/knowledge/articles').map((url) => url.searchParams.get('size'))
    expect(sizes).toContain('10')
    expect(sizes).not.toContain('20')
  })

  it('el extracto es texto: el marcado que llegue en él no se interpreta', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': {
        body: articlePage([articleSummary({ excerpt: '<img src=x onerror=alert(1)> **negrita**' })]),
      },
    })
    const { container } = renderKnowledgeWithContainer()
    expect(await screen.findByText('<img src=x onerror=alert(1)> **negrita**')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('un artículo sin extracto no pinta el párrafo vacío', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': { body: articlePage([articleSummary({ excerpt: '' })]) },
    })
    renderKnowledge()
    const card = (await screen.findByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })).closest('article')!
    expect(card.querySelectorAll('p')).toHaveLength(2) // categoría y fecha
  })

  it('el nombre completo de la categoría y del título siguen accesibles aunque se recorten', async () => {
    const long = 'T'.repeat(120)
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': {
        body: articlePage([
          articleSummary({
            title: long,
            category: { id: 'c', name: 'Una categoría con un nombre larguísimo', slug: 'c' },
          }),
        ]),
      },
    })
    renderKnowledge()
    expect(await screen.findByRole('link', { name: long })).toHaveAttribute('title', long)
    expect(screen.getByText('Una categoría con un nombre larguísimo', { selector: 'span' })).toHaveAttribute(
      'title',
      'Una categoría con un nombre larguísimo',
    )
  })

  it('un cliente no ve «Nuevo artículo», ni las píldoras de estado, ni borradores', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/knowledge/categories': { body: [categories[1]] },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderKnowledge('/conocimiento?status=draft')
    await screen.findByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })
    expect(screen.queryByText('Borrador')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuevo artículo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filtrar por estado' })).not.toBeInTheDocument()
    // Aunque la URL pida borradores, el cliente no los pide: lo que ve lo decide el servidor, no un enlace.
    await vi.waitFor(() => expect(requestsTo(fetchSpy, '/api/knowledge/articles').length).toBeGreaterThan(0))
    for (const url of requestsTo(fetchSpy, '/api/knowledge/articles'))
      expect(url.searchParams.has('status')).toBe(false)
  })

  it('pulsar una categoría filtra la lista y vuelve a la primera página; pulsarla otra vez quita el filtro', async () => {
    const fetchSpy = mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()], 45) },
    })
    const router = renderKnowledge('/conocimiento?page=3')
    const card = await screen.findByRole('link', { name: /Cuenta y acceso/ })
    expect(card).not.toHaveAttribute('aria-current')
    await userEvent.click(card)
    expect(router.state.location.search).toBe('?category=cuenta-y-acceso')
    expect(await screen.findByRole('link', { name: /Cuenta y acceso/ })).toHaveAttribute('aria-current', 'true')
    await vi.waitFor(() => {
      const last = requestsTo(fetchSpy, '/api/knowledge/articles').at(-1)
      expect(last?.searchParams.get('category')).toBe('cuenta-y-acceso')
      expect(last?.searchParams.get('page')).toBe('0')
    })
    await userEvent.click(screen.getByRole('link', { name: /Cuenta y acceso/ }))
    expect(router.state.location.search).toBe('')
  })

  it('las píldoras filtran por estado, llevan el total real y se quitan al volver a pulsarlas', async () => {
    const fetchSpy = mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': (request) => {
        const status = new URL(request.url).searchParams.get('status')
        if (status === 'draft') return { body: articlePage([draft], 7) }
        if (status === 'published') return { body: articlePage([articleSummary()], 23) }
        return { body: articlePage([articleSummary(), draft], 30) }
      },
    })
    const router = renderKnowledge()
    expect(await screen.findByRole('button', { name: /Borradores\s*7/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Publicados\s*23/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Borradores/ }))
    expect(router.state.location.search).toBe('?status=draft')
    expect(screen.getByRole('button', { name: /Borradores/ })).toHaveAttribute('aria-pressed', 'true')
    await vi.waitFor(() =>
      expect(
        requestsTo(fetchSpy, '/api/knowledge/articles')
          .filter((url) => url.searchParams.get('size') === '10')
          .at(-1)
          ?.searchParams.get('status'),
      ).toBe('draft'),
    )
    await userEvent.click(screen.getByRole('button', { name: /Borradores/ }))
    expect(router.state.location.search).toBe('')
  })

  it('con más de seis categorías se ven las seis con más artículos y «Ver las N categorías» las despliega en la URL', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/categories': { body: manyCategories },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    const router = renderKnowledge()
    await screen.findByRole('link', { name: /Categoría 8/ })
    expect(screen.queryByRole('link', { name: /Categoría 1/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Categoría 2/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Categoría 3/ })).toBeInTheDocument()
    const more = screen.getByRole('button', { name: 'Ver las 8 categorías' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(router.state.location.search).toBe('?categories=all')
    expect(screen.getByRole('link', { name: /Categoría 1/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Categoría 2/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(router.state.location.search).toBe('')
    expect(screen.queryByRole('link', { name: /Categoría 1/ })).not.toBeInTheDocument()
  })

  it('una URL con categories=all recarga las categorías desplegadas, y con seis o menos no hay botón', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/categories': { body: manyCategories },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderKnowledge('/conocimiento?categories=all')
    expect(await screen.findByRole('link', { name: /Categoría 1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('con seis categorías o menos no se ofrece desplegar', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/categories': { body: manyCategories.slice(0, 6) },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderKnowledge()
    await screen.findByRole('link', { name: /Categoría 6/ })
    expect(screen.queryByRole('button', { name: /Ver las/ })).not.toBeInTheDocument()
  })

  it('la categoría filtrada sigue a la vista aunque quede fuera de las seis primeras', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/categories': { body: manyCategories },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderKnowledge('/conocimiento?category=categoria-1')
    expect(await screen.findByRole('link', { name: /Categoría 1/ })).toHaveAttribute('aria-current', 'true')
  })

  it('«Buscar» envía el texto al momento, sin esperar al debounce', async () => {
    const fetchSpy = mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    const router = renderKnowledge('/conocimiento?page=2')
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Buscar artículos' }), 'factura')
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(router.state.location.search).toBe('?q=factura')
    await vi.waitFor(() =>
      expect(requestsTo(fetchSpy, '/api/knowledge/articles').at(-1)?.searchParams.get('q')).toBe('factura'),
    )
  })

  it('la búsqueda pasa a la URL al dejar de teclear y se pide al servidor', async () => {
    const fetchSpy = mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    const router = renderKnowledge('/conocimiento?page=2')
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Buscar artículos' }), 'factura')
    await vi.waitFor(() => expect(router.state.location.search).toBe('?q=factura'))
    await vi.waitFor(() =>
      expect(requestsTo(fetchSpy, '/api/knowledge/articles').at(-1)?.searchParams.get('q')).toBe('factura'),
    )
  })

  it('la línea de apoyo trata uno, ninguno y un error de categorías', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/categories': { body: [category({ articles: 1 })] },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderKnowledge()
    expect(await screen.findByText(/Busca en el único artículo/)).toBeInTheDocument()
  })

  it('con cero artículos la línea de apoyo lo dice', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/categories': { body: [] },
      'GET /api/knowledge/articles': { body: articlePage([]) },
    })
    renderKnowledge()
    expect(await screen.findByText('Todavía no hay artículos en tu base de conocimiento.')).toBeInTheDocument()
  })

  it('mientras /me carga no se enseña «Nuevo artículo» ni las píldoras de estado', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/me': () => new Promise(() => {}) as never,
      'GET /api/knowledge/articles': { body: articlePage([articleSummary(), draft]) },
    })
    renderKnowledge('/conocimiento?status=draft')
    await screen.findByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })
    expect(screen.queryByText('Borrador')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuevo artículo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filtrar por estado' })).not.toBeInTheDocument()
  })

  it('sin artículos el personal puede crear el primero', async () => {
    mockApi({ ...staffRoutes, 'GET /api/knowledge/articles': { body: articlePage([]) } })
    renderKnowledge()
    expect(await screen.findByText('Todavía no hay artículos')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Nuevo artículo/ })).toHaveLength(2)
  })

  it('sin artículos un cliente no ve ninguna acción de crear ni la sección de categorías', async () => {
    mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/knowledge/categories': { body: [] },
      'GET /api/knowledge/articles': { body: articlePage([]) },
    })
    renderKnowledge()
    expect(await screen.findByText('Todavía no hay artículos')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuevo artículo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Categorías' })).not.toBeInTheDocument()
  })

  it('sin resultados ofrece limpiar los filtros y los quita', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': (request) => ({
        body: articlePage(new URL(request.url).searchParams.has('q') ? [] : [articleSummary()]),
      }),
    })
    const router = renderKnowledge('/conocimiento?q=zzz&category=facturacion&page=2')
    expect(await screen.findByText('No encontramos artículos')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(await screen.findByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('searchbox', { name: 'Buscar artículos' })).toHaveValue('')
  })

  it('una página que ya no existe lleva a la primera', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': (request) => ({
        body:
          new URL(request.url).searchParams.get('page') === '4'
            ? { ...articlePage([], 3), page: 4 }
            : articlePage([articleSummary()]),
      }),
    })
    const router = renderKnowledge('/conocimiento?page=5')
    await userEvent.click(await screen.findByRole('button', { name: 'Ir a la primera página' }))
    expect(await screen.findByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('un error en la lista ofrece reintentar y la recupera, sin ocultar las categorías', async () => {
    let fail = true
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': () =>
        fail ? { status: 500, body: { status: 500, title: 'Error' } } : { body: articlePage([articleSummary()]) },
    })
    renderKnowledge()
    expect(await screen.findByText('No pudimos cargar los artículos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Facturación/ })).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar los artículos' }))
    expect(await screen.findByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })).toBeInTheDocument()
  })

  it('un 403 en la lista dice que no hay permisos, sin ofrecer reintentar', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': { status: 403, body: { status: 403, title: 'Prohibido' } },
    })
    renderKnowledge()
    expect(await screen.findByText('No tienes acceso a estos artículos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
  })

  it('un error en las categorías lo dice sin mover la lista y permite reintentar', async () => {
    let fail = true
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/categories': () =>
        fail ? { status: 500, body: { status: 500, title: 'Error' } } : { body: categories },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderKnowledge()
    expect(await screen.findByText('No pudimos cargar las categorías')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })).toBeInTheDocument()
    expect(screen.getByText('Busca en tu base de conocimiento o empieza por una categoría.')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar las categorías' }))
    expect(await screen.findByRole('link', { name: /Facturación/ })).toBeInTheDocument()
    expect(screen.queryByText('No pudimos cargar las categorías')).not.toBeInTheDocument()
  })
})
