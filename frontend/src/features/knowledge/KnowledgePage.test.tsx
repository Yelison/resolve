import { screen, within } from '@testing-library/react'
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
  const router = createMemoryRouter([{ path: '/conocimiento', element: <KnowledgePage /> }], {
    initialEntries: [path],
  })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

const requestsTo = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url)).filter((url) => url.pathname === path)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('KnowledgePage', () => {
  it('muestra esqueletos mientras carga', () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/categories': () => new Promise(() => {}) as never,
      'GET /api/knowledge/articles': () => new Promise(() => {}) as never,
    })
    renderKnowledge()
    expect(screen.getByText('Cargando categorías…')).toBeInTheDocument()
    expect(screen.getByText('Cargando artículos…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('el personal ve las categorías, la tabla con estado y «Nuevo artículo»', async () => {
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': { body: articlePage([articleSummary(), draft]) },
    })
    renderKnowledge()
    const table = await screen.findByRole('table', { name: 'Artículos' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Artículo', 'Categoría', 'Estado', 'Actualizado', 'Acciones'])
    expect(within(table).getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Base de conocimiento' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nuevo artículo/ })).toHaveAttribute('href', '/conocimiento/nuevo')
    expect(screen.getByRole('button', { name: 'Estado' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar artículos' })).toHaveAttribute(
      'placeholder',
      'Buscar por título, contenido o categoría…',
    )
    expect(screen.getByRole('button', { name: /Facturación/ })).toHaveTextContent('Planes y pagos · 6 artículos')
    expect(screen.getByRole('button', { name: /Primeros pasos/ })).toHaveTextContent('1 artículo')
  })

  it('un cliente no ve «Nuevo artículo», ni el filtro ni la columna de estado, ni borradores', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/knowledge/categories': { body: [categories[1]] },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderKnowledge('/conocimiento?status=draft')
    const table = await screen.findByRole('table', { name: 'Artículos' })
    expect(within(table).queryByRole('columnheader', { name: 'Estado' })).not.toBeInTheDocument()
    expect(screen.queryByText('Borrador')).not.toBeInTheDocument()
    expect(screen.queryByText('Publicado')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuevo artículo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Estado/ })).not.toBeInTheDocument()
    // Aunque la URL pida borradores, el cliente no los pide: lo que ve lo decide el servidor, no un enlace.
    await vi.waitFor(() => expect(requestsTo(fetchSpy, '/api/knowledge/articles').length).toBeGreaterThan(0))
    await vi.waitFor(() =>
      expect(requestsTo(fetchSpy, '/api/knowledge/articles').at(-1)?.searchParams.has('status')).toBe(false),
    )
  })

  it('pulsar una categoría filtra la lista y vuelve a la primera página; pulsarla otra vez quita el filtro', async () => {
    const fetchSpy = mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()], 45) },
    })
    const router = renderKnowledge('/conocimiento?page=3')
    const card = await screen.findByRole('button', { name: /Cuenta y acceso/ })
    expect(card).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(card)
    expect(router.state.location.search).toBe('?category=cuenta-y-acceso')
    expect(await screen.findByRole('button', { name: /Cuenta y acceso/ })).toHaveAttribute('aria-pressed', 'true')
    await vi.waitFor(() => {
      const last = requestsTo(fetchSpy, '/api/knowledge/articles').at(-1)
      expect(last?.searchParams.get('category')).toBe('cuenta-y-acceso')
      expect(last?.searchParams.get('page')).toBe('0')
    })
    await userEvent.click(screen.getByRole('button', { name: /Cuenta y acceso/ }))
    expect(router.state.location.search).toBe('')
  })

  it('el filtro de estado del personal pide solo borradores', async () => {
    const fetchSpy = mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': (request) => ({
        body: articlePage(
          new URL(request.url).searchParams.get('status') === 'draft' ? [draft] : [articleSummary(), draft],
        ),
      }),
    })
    const router = renderKnowledge()
    await screen.findByRole('table', { name: 'Artículos' })
    await userEvent.click(screen.getByRole('button', { name: 'Estado' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Borradores' }))
    expect(router.state.location.search).toBe('?status=draft')
    expect(await screen.findByRole('button', { name: 'Estado: Borradores' })).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(requestsTo(fetchSpy, '/api/knowledge/articles').at(-1)?.searchParams.get('status')).toBe('draft'),
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

  it('sin artículos el personal puede crear el primero y un cliente no', async () => {
    mockApi({ ...staffRoutes, 'GET /api/knowledge/articles': { body: articlePage([]) } })
    renderKnowledge()
    expect(await screen.findByText('Todavía no hay artículos')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Nuevo artículo/ })).toHaveLength(2)
  })

  it('sin artículos un cliente no ve ninguna acción de crear', async () => {
    mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/knowledge/categories': { body: [] },
      'GET /api/knowledge/articles': { body: articlePage([]) },
    })
    renderKnowledge()
    expect(await screen.findByText('Todavía no hay artículos')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuevo artículo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Categorías' })).not.toBeInTheDocument()
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

  it('un error en la lista ofrece reintentar y la recupera', async () => {
    let fail = true
    mockApi({
      ...staffRoutes,
      'GET /api/knowledge/articles': () =>
        fail ? { status: 500, body: { status: 500, title: 'Error' } } : { body: articlePage([articleSummary()]) },
    })
    renderKnowledge()
    expect(await screen.findByText('No pudimos cargar los artículos')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table', { name: 'Artículos' })).toBeInTheDocument()
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
    expect(screen.getByRole('table', { name: 'Artículos' })).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar las categorías' }))
    expect(await screen.findByRole('button', { name: /Facturación/ })).toBeInTheDocument()
    expect(screen.queryByText('No pudimos cargar las categorías')).not.toBeInTheDocument()
  })
})
