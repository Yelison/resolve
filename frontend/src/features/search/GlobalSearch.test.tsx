import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi, type MockRoute } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { page, summary } from '../../test/ticketFixtures'
import { articlePage, articleSummary } from '../knowledge/articleFixtures'
import { GlobalSearch } from './GlobalSearch'

const customerRow = {
  id: 'c-maria',
  name: 'María Pérez',
  email: 'maria@cliente.example',
  company: 'Acme Studio',
  openTickets: 1,
  totalTickets: 4,
  createdAt: '2026-09-01T10:00:00Z',
  archived: false,
}
const customerPage = (items: unknown[] = [customerRow]) => ({
  items,
  page: 0,
  size: 5,
  totalItems: items.length,
  totalPages: items.length ? 1 : 0,
})

const ok = {
  'GET /api/me': { body: adminMe },
  'GET /api/tickets': { body: page([summary()]) },
  'GET /api/customers': { body: customerPage() },
  'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
} satisfies Record<string, MockRoute>

function renderSearch(onClose = () => {}) {
  const router = createMemoryRouter([{ path: '*', element: <GlobalSearch open onClose={onClose} /> }], {
    initialEntries: ['/clientes'],
  })
  renderWithProviders(<RouterProvider router={router} />)
  return { router, input: screen.getByRole('combobox', { name: 'Buscar en Resolve' }) }
}

const announcement = () => document.querySelector('p[role="status"]')!.textContent

describe('GlobalSearch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('pide escribir al menos dos caracteres y no busca antes', async () => {
    const spy = mockApi(ok)
    const { input } = renderSearch()
    expect(screen.getByText('Escribe al menos 2 caracteres para buscar.')).toBeInTheDocument()
    await userEvent.type(input, 'c')
    expect(screen.getByText('Escribe al menos 2 caracteres para buscar.')).toBeInTheDocument()
    expect(spy.mock.calls.filter(([request]) => String((request as Request).url).includes('/tickets'))).toHaveLength(0)
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('muestra los resultados agrupados, con «Ver todos» y el total en la región viva', async () => {
    mockApi(ok)
    const { input } = renderSearch()
    await userEvent.type(input, 'cuenta')

    const list = await screen.findByRole('listbox', { name: 'Resultados de la búsqueda' })
    expect(input).toHaveAttribute('aria-controls', list.id)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    const tickets = within(list).getByRole('group', { name: 'Tickets' })
    expect(within(tickets).getByRole('option', { name: /#1048 No puedo acceder a mi cuenta\s*Abierto/ })).toBeVisible()
    expect(within(tickets).getByRole('option', { name: 'Ver todos los resultados de tickets' })).toBeVisible()
    const customers = within(list).getByRole('group', { name: 'Clientes' })
    expect(within(customers).getByRole('option', { name: /María Pérez\s*Acme Studio/ })).toBeVisible()
    const articles = within(list).getByRole('group', { name: 'Artículos' })
    expect(
      within(articles).getByRole('option', { name: /Cómo recuperar el acceso a tu cuenta\s*Cuenta y acceso/ }),
    ).toBeVisible()
    await waitFor(() => expect(announcement()).toBe('3 resultados'))
  })

  it('recorre los resultados con las flechas y Enter navega al detalle y cierra', async () => {
    mockApi(ok)
    const onClose = vi.fn()
    const { input, router } = renderSearch(onClose)
    await userEvent.type(input, 'cuenta')
    await screen.findByRole('listbox')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(6))

    await userEvent.keyboard('{ArrowDown}')
    const first = screen.getAllByRole('option')[0]!
    expect(input).toHaveAttribute('aria-activedescendant', first.id)
    expect(first).toHaveAttribute('aria-selected', 'true')
    // Tickets: resultado y «Ver todos»; Clientes: resultado. Con ArrowUp se vuelve atrás una posición.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}')
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2]!.id)
    await userEvent.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/clientes/c-maria')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Enter sin un resultado activo no navega', async () => {
    mockApi(ok)
    const { input, router } = renderSearch()
    await userEvent.type(input, 'cuenta')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Enter}')
    expect(router.state.location.pathname).toBe('/clientes')
  })

  it('cada grupo tiene su «Ver todos los resultados» con ?q= aplicado', async () => {
    mockApi(ok)
    const { input, router } = renderSearch()
    await userEvent.type(input, 'cuenta ñ')
    await userEvent.click(await screen.findByRole('option', { name: 'Ver todos los resultados de tickets' }))
    expect(router.state.location.pathname + router.state.location.search).toBe('/tickets?q=cuenta+%C3%B1')

    await userEvent.click(screen.getByRole('option', { name: 'Ver todos los resultados de clientes' }))
    expect(router.state.location.pathname).toBe('/clientes')
    expect(router.state.location.search).toBe('?q=cuenta+%C3%B1')

    await userEvent.click(screen.getByRole('option', { name: 'Ver todos los resultados de artículos' }))
    expect(router.state.location.pathname).toBe('/conocimiento')
  })

  it('un artículo lleva a su detalle por el slug', async () => {
    mockApi(ok)
    const { input, router } = renderSearch()
    await userEvent.type(input, 'cuenta')
    await userEvent.click(await screen.findByRole('option', { name: /Cómo recuperar el acceso/ }))
    expect(router.state.location.pathname).toBe('/conocimiento/como-recuperar-el-acceso-a-tu-cuenta')
  })

  it('anuncia «Sin resultados» y muestra el estado vacío cuando ningún grupo encuentra nada', async () => {
    mockApi({
      ...ok,
      'GET /api/tickets': { body: page([]) },
      'GET /api/customers': { body: customerPage([]) },
      'GET /api/knowledge/articles': { body: articlePage([]) },
    })
    const { input } = renderSearch()
    await userEvent.type(input, 'zzz')
    expect(await screen.findByRole('heading', { name: 'Sin resultados' })).toBeInTheDocument()
    expect(screen.getByText('No hay nada que coincida con «zzz».')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(announcement()).toBe('Sin resultados')
  })

  it('muestra la carga de cada grupo sin anunciar resultados hasta que llegan', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    mockApi({
      ...ok,
      'GET /api/customers': async () => {
        await gate
        return { body: customerPage() }
      },
    })
    const { input } = renderSearch()
    await userEvent.type(input, 'cuenta')
    expect(await screen.findByText('Buscando en clientes…')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: /#1048/ })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Tickets' })).toBeVisible()
    expect(announcement()).toBe('')
    release()
    await waitFor(() => expect(announcement()).toBe('3 resultados'))
  })

  it('un grupo que falla no oculta los demás: avisa, ofrece reintentar y lo anuncia', async () => {
    let failing = true
    const spy = mockApi({
      ...ok,
      'GET /api/customers': () =>
        failing ? { status: 500, body: { status: 500, title: 'Error' } } : { body: customerPage() },
    })
    const { input } = renderSearch()
    await userEvent.type(input, 'cuenta')

    const retry = await screen.findByRole('option', { name: /No se pudo buscar en clientes\.\s*Reintentar clientes/ })
    expect(screen.getByRole('option', { name: /#1048/ })).toBeVisible()
    expect(screen.getByRole('option', { name: /Cómo recuperar/ })).toBeVisible()
    expect(screen.queryByRole('option', { name: /María Pérez/ })).not.toBeInTheDocument()
    await waitFor(() => expect(announcement()).toBe('2 resultados. No se pudo buscar en clientes.'))

    failing = false
    const before = spy.mock.calls.length
    await userEvent.click(retry)
    expect(await screen.findByRole('option', { name: /María Pérez/ })).toBeVisible()
    expect(spy.mock.calls.length).toBeGreaterThan(before)
    await waitFor(() => expect(announcement()).toBe('3 resultados'))
  })

  it('si todos los grupos fallan lo dice y deja reintentar cada uno', async () => {
    const failure = { status: 500, body: { status: 500, title: 'Error' } }
    mockApi({
      ...ok,
      'GET /api/tickets': failure,
      'GET /api/customers': failure,
      'GET /api/knowledge/articles': failure,
    })
    const { input } = renderSearch()
    await userEvent.type(input, 'cuenta')
    await screen.findByRole('option', { name: /Reintentar tickets/ })
    expect(screen.getByRole('option', { name: /Reintentar clientes/ })).toBeVisible()
    expect(screen.getByRole('option', { name: /Reintentar artículos/ })).toBeVisible()
    await waitFor(() => expect(announcement()).toBe('No se pudo buscar en tickets ni en clientes ni en artículos.'))
  })

  it('un cliente no ve el grupo de clientes ni lo consulta', async () => {
    const spy = mockApi({ ...ok, 'GET /api/me': { body: customerMe } })
    const { input } = renderSearch()
    await userEvent.type(input, 'cuenta')
    await screen.findByRole('group', { name: 'Tickets' })
    expect(screen.getByRole('group', { name: 'Artículos' })).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Clientes' })).not.toBeInTheDocument()
    expect(spy.mock.calls.some(([request]) => String((request as Request).url).includes('/customers'))).toBe(false)
  })

  it('un 403 no se muestra como error ni como resultado', async () => {
    mockApi({ ...ok, 'GET /api/customers': { status: 403, body: { status: 403, title: 'Prohibido' } } })
    const { input } = renderSearch()
    await userEvent.type(input, 'cuenta')
    await screen.findByRole('group', { name: 'Tickets' })
    await waitFor(() => expect(announcement()).toBe('2 resultados'))
    expect(screen.queryByRole('group', { name: 'Clientes' })).not.toBeInTheDocument()
    expect(screen.queryByText(/No se pudo buscar/)).not.toBeInTheDocument()
  })

  it('sin sesión no ofrece buscar y lo explica', async () => {
    const spy = mockApi({ ...ok, 'GET /api/me': { status: 401, body: { status: 401, title: 'No autenticado' } } })
    const { input } = renderSearch()
    await userEvent.type(input, 'cuenta')
    expect(await screen.findByRole('heading', { name: 'La búsqueda no está disponible' })).toBeInTheDocument()
    expect(spy.mock.calls.some(([request]) => String((request as Request).url).includes('/tickets'))).toBe(false)
  })

  it('Escape cierra el diálogo aunque haya texto, sin borrarlo antes', async () => {
    mockApi(ok)
    const onClose = vi.fn()
    const { input } = renderSearch(onClose)
    await userEvent.type(input, 'cuenta')
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(input).toHaveValue('cuenta')
    // Se cancela el keydown: el navegador no vacía el campo de búsqueda con Escape.
    expect(fireEvent.keyDown(input, { key: 'Escape' })).toBe(false)
  })

  it('el campo es un combobox con lista y se nombra para lectores de pantalla', async () => {
    mockApi(ok)
    const { input } = renderSearch()
    expect(screen.getByRole('dialog', { name: 'Buscar' })).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
  })

  it('al cambiar el texto de golpe, los resultados del anterior no se recorren ni se activan', async () => {
    mockApi({
      ...ok,
      'GET /api/tickets': (request) => {
        const q = new URL(request.url).searchParams.get('q')
        return {
          body: q === 'xy' ? page([summary({ id: 't-xy', number: 7, subject: 'Otro asunto' })]) : page([summary()]),
        }
      },
    })
    const onClose = vi.fn()
    const { input, router } = renderSearch(onClose)
    await userEvent.type(input, 'ab')
    await screen.findByRole('option', { name: /#1048/ })
    await waitFor(() => expect(announcement()).toBe('3 resultados'))

    // Borra y escribe otro texto antes de que acabe la espera: en pantalla siguen los resultados de «ab».
    await userEvent.clear(input)
    await userEvent.type(input, 'xy')
    const old = screen.getByRole('option', { name: /#1048/ })
    expect(old).toHaveAttribute('aria-disabled', 'true')
    // Las opciones de «ab» siguen dentro de la lista y el combobox no se declara cerrado mientras se ven.
    const list = screen.getByRole('listbox', { name: 'Resultados de la búsqueda' })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', list.id)
    expect(within(list).getAllByRole('option').length).toBeGreaterThan(0)
    for (const option of within(list).getAllByRole('option')) expect(option).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    await userEvent.click(old)
    await userEvent.click(screen.getByRole('option', { name: 'Ver todos los resultados de tickets' }))
    expect(router.state.location.pathname).toBe('/clientes')
    expect(onClose).not.toHaveBeenCalled()

    // Con la respuesta de «xy» las filas se activan y «Ver todos» lleva al texto escrito.
    const fresh = await screen.findByRole('option', { name: /#7 Otro asunto/ })
    await waitFor(() => expect(fresh).not.toHaveAttribute('aria-disabled'))
    await userEvent.click(screen.getByRole('option', { name: 'Ver todos los resultados de tickets' }))
    expect(router.state.location.pathname + router.state.location.search).toBe('/tickets?q=xy')
  })
})
