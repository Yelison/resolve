import { screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { article, articlePage, articleSummary } from './articleFixtures'
import { appRoutes } from '../../app/router'

// Las rutas de conocimiento cargan sus vistas con `lazy`. La primera importación transforma `react-markdown` en frío y
// puede tardar más que la espera por defecto de Testing Library: se precarga aquí y las esperas llevan margen.
beforeAll(async () => {
  await Promise.all([import('./ArticlePage'), import('./ArticleEditorPage'), import('./KnowledgePage')])
}, 60_000)
const COLD = { timeout: 10_000 }

afterEach(() => {
  vi.restoreAllMocks()
})

function renderApp(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

describe('rutas de la aplicación', () => {
  const staffMes = [
    ['admin', adminMe],
    ['agent', { ...adminMe, role: 'agent' }],
  ] as const

  it('deja a un cliente abrir /conocimiento, sin aviso de acceso ni acciones de personal', async () => {
    mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/knowledge/categories': { body: [] },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    renderApp('/conocimiento')
    expect(await screen.findByRole('heading', { level: 1, name: 'Base de conocimiento' }, COLD)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' }, COLD)).toBeInTheDocument()
    expect(screen.queryByText('No tienes acceso a esta sección')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuevo artículo/ })).not.toBeInTheDocument()
  })

  it.each(staffMes)('deja al personal abrir la lista de conocimiento como %s', async (_role, me) => {
    mockApi({
      'GET /api/me': { body: me },
      'GET /api/knowledge/categories': { body: [] },
      'GET /api/knowledge/articles': { body: articlePage([]) },
    })
    renderApp('/conocimiento')
    expect(await screen.findByText('Todavía no hay artículos', {}, COLD)).toBeInTheDocument()
    expect(screen.queryByText('No tienes acceso a esta sección')).not.toBeInTheDocument()
  })

  it('un cliente no abre /conocimiento/nuevo: ve el aviso sin acceso', async () => {
    mockApi({ 'GET /api/me': { body: customerMe } })
    renderApp('/conocimiento/nuevo')
    expect(await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' }, COLD)).toBeInTheDocument()
    expect(screen.queryByText('Vista en construcción')).not.toBeInTheDocument()
  })

  it('/conocimiento/nuevo abre el editor al personal', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/knowledge/categories': { body: [] },
    })
    renderApp('/conocimiento/nuevo')
    expect(await screen.findByRole('heading', { level: 1, name: 'Nuevo artículo' }, COLD)).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'Título' }, COLD)).toBeInTheDocument()
  })

  it('/conocimiento/:slug/editar abre el editor al personal con el artículo cargado', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/knowledge/categories': { body: [] },
      'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': { body: article() },
    })
    renderApp('/conocimiento/como-recuperar-el-acceso-a-tu-cuenta/editar')
    expect(await screen.findByRole('heading', { level: 1, name: 'Editar artículo' }, COLD)).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'Título' }, COLD)).toHaveValue(
      'Cómo recuperar el acceso a tu cuenta',
    )
  })

  it('un cliente lee un artículo en /conocimiento/:slug, sin acciones de personal', async () => {
    mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': { body: article() },
    })
    renderApp('/conocimiento/como-recuperar-el-acceso-a-tu-cuenta')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cómo recuperar el acceso a tu cuenta' }, COLD),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar artículo' })).not.toBeInTheDocument()
  })

  it('un cliente no abre /conocimiento/:slug/editar: ve el aviso sin acceso', async () => {
    mockApi({ 'GET /api/me': { body: customerMe } })
    renderApp('/conocimiento/como-recuperar-el-acceso-a-tu-cuenta/editar')
    expect(await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' }, COLD)).toBeInTheDocument()
  })
})
