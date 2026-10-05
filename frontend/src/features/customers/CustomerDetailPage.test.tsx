import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { ticket } from '../../test/ticketFixtures'
import { ticketKeys } from '../tickets/queries'
import { CustomerDetailPage } from './CustomerDetailPage'
import { customerDetail } from './customerFixtures'
import { customerKeys } from './queries'
import { ticketContext } from './ticketContext'

const agentMe = {
  ...adminMe,
  user: { id: 'u-laura', name: 'Laura Méndez', email: 'laura@acme.example' },
  role: 'agent',
}
const emptyTickets = { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }
const ticketPage = (items: unknown[]) => ({ items, page: 0, size: 20, totalItems: items.length, totalPages: 1 })

function renderDetail(id = 'c-maria') {
  const router = createMemoryRouter(
    [
      { path: '/clientes/:id', element: <CustomerDetailPage /> },
      { path: '/tickets/:number', element: <p>Ticket</p> },
    ],
    { initialEntries: [`/clientes/${id}`] },
  )
  return renderWithProviders(<RouterProvider router={router} />)
}

const api = (overrides = {}) =>
  mockApi({
    'GET /api/me': { body: adminMe },
    'GET /api/customers/c-maria': { body: customerDetail() },
    'GET /api/tickets': { body: emptyTickets },
    ...overrides,
  })

const sent = (fetchSpy: ReturnType<typeof mockApi>, method: string) =>
  fetchSpy.mock.calls.map(([input]) => input as Request).find((request) => request.method === method)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ticketContext', () => {
  it('concuerda el plural y calcula los resueltos', () => {
    expect(ticketContext({ totalTickets: 4, openTickets: 1 })).toBe('4 tickets · 1 abierto · 3 resueltos')
    expect(ticketContext({ totalTickets: 1, openTickets: 1 })).toBe('1 ticket · 1 abierto · 0 resueltos')
    expect(ticketContext({ totalTickets: 2, openTickets: 0 })).toBe('2 tickets · 0 abiertos · 2 resueltos')
  })
})

describe('CustomerDetailPage', () => {
  it('muestra un esqueleto mientras carga', () => {
    api({ 'GET /api/customers/c-maria': () => new Promise(() => {}) as never })
    renderDetail()
    expect(screen.getByText('Cargando cliente…')).toBeInTheDocument()
  })

  it('muestra el perfil, el contexto de tickets y el acceso al portal', async () => {
    api()
    renderDetail()
    expect(await screen.findByRole('heading', { level: 1, name: 'María Pérez' })).toBeInTheDocument()
    expect(screen.getByText('4 tickets · 1 abierto · 3 resueltos')).toBeInTheDocument()
    expect(screen.getByText('Acceso activo')).toBeInTheDocument()
    expect(screen.queryByText('Plan Pro')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tickets' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Notas' })).toBeInTheDocument()
  })

  it('muestra el subtítulo con la empresa y la fecha de alta, y el avatar y el botón de la maqueta', async () => {
    api()
    renderDetail()
    expect(await screen.findByText('Cliente · Acme Studio · cliente desde 1 de septiembre de 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar cliente' })).toBeInTheDocument()
    expect(screen.getByText('MP')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Contexto de atención' })).toHaveTextContent(
      '4 tickets · 1 abierto · 3 resueltosPrefiere que la llamen por la mañana.',
    )
  })

  it('sin empresa omite ese tramo del subtítulo', async () => {
    api({ 'GET /api/customers/c-maria': { body: customerDetail({ company: null }) } })
    renderDetail()
    expect(await screen.findByText('Cliente · cliente desde 1 de septiembre de 2026')).toBeInTheDocument()
  })

  it.each([
    ['none', 'Sin acceso'],
    ['invited', 'Invitación pendiente'],
  ] as const)('muestra el acceso «%s» como «%s»', async (portalAccess, label) => {
    api({ 'GET /api/customers/c-maria': { body: customerDetail({ portalAccess }) } })
    renderDetail()
    expect(await screen.findByText(label)).toBeInTheDocument()
  })

  it('un cliente inexistente muestra «No existe el cliente»', async () => {
    api({ 'GET /api/customers/c-maria': { status: 404, body: { status: 404, title: 'No encontrado' } } })
    renderDetail()
    expect(await screen.findByText('No existe el cliente')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a clientes' })).toHaveAttribute('href', '/clientes')
  })

  it('un error de carga ofrece reintentar', async () => {
    let fail = true
    api({
      'GET /api/customers/c-maria': () =>
        fail ? { status: 500, body: { status: 500, title: 'Error' } } : { body: customerDetail() },
    })
    renderDetail()
    expect(await screen.findByText('Revisa tu conexión')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'María Pérez' })).toBeInTheDocument()
  })

  describe('pestaña Tickets', () => {
    it('lista los tickets del cliente y enlaza a su detalle', async () => {
      const fetchSpy = api({ 'GET /api/tickets': { body: ticketPage([ticket()]) } })
      renderDetail()
      const table = await screen.findByRole('table', { name: 'Tickets de María Pérez' })
      expect(within(table).getByRole('link', { name: /No puedo acceder a mi cuenta/ })).toHaveAttribute(
        'href',
        '/tickets/1048',
      )
      expect(within(table).queryByRole('button', { name: /Acciones del ticket/ })).not.toBeInTheDocument()
      const request = fetchSpy.mock.calls
        .map(([input]) => new URL((input as Request).url))
        .find((url) => url.pathname === '/api/tickets')!
      expect(request.searchParams.get('customerId')).toBe('c-maria')
    })

    it('sin tickets muestra el estado vacío', async () => {
      api()
      renderDetail()
      expect(await screen.findByText('Sin tickets todavía')).toBeInTheDocument()
    })

    it('un error de la lista se dice y permite reintentar sin tapar el perfil', async () => {
      api({ 'GET /api/tickets': { status: 500, body: { status: 500, title: 'Error' } } })
      renderDetail()
      expect(await screen.findByText('No pudimos cargar los tickets')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reintentar cargar los tickets del cliente' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: 'María Pérez' })).toBeInTheDocument()
    })
  })

  describe('pestaña Notas', () => {
    async function openNotes() {
      await userEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
      return screen.findByRole('textbox', { name: 'Notas internas' })
    }

    it('guarda las notas con la versión leída como If-Match', async () => {
      const fetchSpy = api({
        'PATCH /api/customers/c-maria': { body: customerDetail({ notes: 'Llamar a las 9.', version: 4 }) },
      })
      renderDetail()
      const notes = await openNotes()
      expect(notes).toHaveValue('Prefiere que la llamen por la mañana.')
      const save = screen.getByRole('button', { name: 'Guardar notas' })
      expect(save).toBeDisabled()
      await userEvent.clear(notes)
      await userEvent.type(notes, 'Llamar a las 9.')
      await userEvent.click(save)
      const region = screen.getByRole('region', { name: 'Notificaciones' })
      expect(await within(region).findByText('Cambios guardados')).toBeInTheDocument()
      const patch = sent(fetchSpy, 'PATCH')!
      expect(patch.headers.get('If-Match')).toBe('"3"')
      expect(await patch.clone().json()).toEqual({ notes: 'Llamar a las 9.' })
      await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar notas' })).toBeDisabled())
    })

    it('conserva el borrador al cambiar de pestaña', async () => {
      api()
      renderDetail()
      const notes = await openNotes()
      await userEvent.type(notes, ' Extra.')
      await userEvent.click(screen.getByRole('tab', { name: 'Tickets' }))
      await userEvent.click(screen.getByRole('tab', { name: 'Notas' }))
      expect(screen.getByRole('textbox', { name: 'Notas internas' })).toHaveValue(
        'Prefiere que la llamen por la mañana. Extra.',
      )
    })

    it('un 412 avisa, recarga el cliente y conserva el texto escrito', async () => {
      let reads = 0
      api({
        'GET /api/customers/c-maria': () => {
          reads += 1
          return { body: customerDetail(reads === 1 ? {} : { company: 'Nueva SL', version: 4 }) }
        },
        'PATCH /api/customers/c-maria': { status: 412, body: { status: 412, title: 'El recurso cambió' } },
      })
      renderDetail()
      const notes = await openNotes()
      await userEvent.type(notes, ' Extra.')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar notas' }))
      expect(await screen.findByText('El cliente cambió mientras editabas las notas')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByText('Nueva SL', { selector: 'dd' })).toBeInTheDocument())
      expect(screen.getByRole('textbox', { name: 'Notas internas' })).toHaveValue(
        'Prefiere que la llamen por la mañana. Extra.',
      )
    })
  })

  describe('archivar y restaurar', () => {
    it('archiva con confirmación y pasa a «Archivado» con «Restaurar»', async () => {
      const fetchSpy = api({
        'POST /api/customers/c-maria/archive': {
          body: customerDetail({ archived: true, archivedAt: '2026-10-05T10:00:00Z', version: 4 }),
        },
      })
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: 'Archivar' }))
      const dialog = screen.getByRole('dialog', { name: '¿Archivar a este cliente?' })
      expect(sent(fetchSpy, 'POST')).toBeUndefined()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Archivar cliente' }))
      expect(await screen.findByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
      expect(screen.getAllByText('Archivado').length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: 'Archivar' })).not.toBeInTheDocument()
      expect(screen.getByText('Acceso suspendido')).toBeInTheDocument()
      expect(screen.queryByText('Acceso activo')).not.toBeInTheDocument()
    })

    it('cancelar la confirmación no archiva', async () => {
      const fetchSpy = api()
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: 'Archivar' }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(sent(fetchSpy, 'POST')).toBeUndefined()
      expect(screen.getByRole('button', { name: 'Archivar' })).toBeInTheDocument()
    })

    it('restaura un cliente archivado', async () => {
      api({
        'GET /api/customers/c-maria': { body: customerDetail({ archived: true, archivedAt: '2026-10-05T10:00:00Z' }) },
        'POST /api/customers/c-maria/restore': { body: customerDetail({ version: 5 }) },
      })
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: 'Restaurar' }))
      expect(await screen.findByRole('button', { name: 'Archivar' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Restaurar' })).not.toBeInTheDocument()
    })

    it('un archivado desactiva la edición y lo explica', async () => {
      api({ 'GET /api/customers/c-maria': { body: customerDetail({ archived: true }) } })
      renderDetail()
      expect(await screen.findByRole('button', { name: 'Editar cliente' })).toBeDisabled()
      expect(screen.getByText('Cliente archivado')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('tab', { name: 'Notas' }))
      expect(screen.getByRole('textbox', { name: 'Notas internas' })).toBeDisabled()
      expect(screen.getByText('Edición desactivada: el cliente está archivado.')).toBeInTheDocument()
    })

    it('un agente no ve «Archivar» ni «Restaurar», pero sí puede editar', async () => {
      api({ 'GET /api/me': { body: agentMe } })
      renderDetail()
      expect(await screen.findByRole('button', { name: 'Editar cliente' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Archivar' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Restaurar' })).not.toBeInTheDocument()
    })

    it('un agente ante un archivado no ve «Restaurar» y se le dice a quién pedirlo', async () => {
      api({
        'GET /api/me': { body: agentMe },
        'GET /api/customers/c-maria': { body: customerDetail({ archived: true }) },
      })
      renderDetail()
      expect(await screen.findByText(/Pide a un administrador/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Restaurar' })).not.toBeInTheDocument()
    })

    it('un 409 al archivar avisa y recarga el estado real', async () => {
      let reads = 0
      api({
        'GET /api/customers/c-maria': () => {
          reads += 1
          return { body: customerDetail(reads === 1 ? {} : { archived: true, version: 4 }) }
        },
        'POST /api/customers/c-maria/archive': { status: 409, body: { status: 409, title: 'Conflicto' } },
      })
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: 'Archivar' }))
      await userEvent.click(screen.getByRole('button', { name: 'Archivar cliente' }))
      expect(await screen.findByText('El cliente ya estaba archivado')).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    })
  })

  describe('edición e invalidaciones', () => {
    it('editar el nombre invalida la lista, métricas, empresas, búsqueda y los tickets', async () => {
      api({ 'PATCH /api/customers/c-maria': { body: customerDetail({ name: 'María P. Ruiz', version: 4 }) } })
      const { queryClient } = renderDetail()
      const seeded = [
        customerKeys.list({ page: 1, pageSize: 20 }),
        customerKeys.metrics(),
        customerKeys.companies(),
        customerKeys.search('mar'),
        ticketKeys.metrics(),
        ticketKeys.detail(1048),
      ]
      for (const key of seeded) queryClient.setQueryData(key, {})
      await userEvent.click(await screen.findByRole('button', { name: 'Editar cliente' }))
      const name = screen.getByRole('textbox', { name: 'Nombre' })
      await userEvent.clear(name)
      await userEvent.type(name, 'María P. Ruiz')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'María P. Ruiz' })).toBeInTheDocument()
      for (const key of seeded) expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true)
    })

    it('editar solo las notas no toca los tickets', async () => {
      api({ 'PATCH /api/customers/c-maria': { body: customerDetail({ notes: 'Otra.', version: 4 }) } })
      const { queryClient } = renderDetail()
      queryClient.setQueryData(ticketKeys.detail(1048), {})
      await userEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
      const notes = screen.getByRole('textbox', { name: 'Notas internas' })
      await userEvent.clear(notes)
      await userEvent.type(notes, 'Otra.')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar notas' }))
      await waitFor(() =>
        expect(queryClient.getQueryData(customerKeys.detail('c-maria'))).toMatchObject({ version: 4 }),
      )
      expect(queryClient.getQueryState(ticketKeys.detail(1048))?.isInvalidated).toBe(false)
    })

    it('archivar invalida la lista, las métricas, las empresas y el detalle', async () => {
      api({
        'POST /api/customers/c-maria/archive': { body: customerDetail({ archived: true, version: 4 }) },
      })
      const { queryClient } = renderDetail()
      const seeded = [customerKeys.list({ page: 1, pageSize: 20 }), customerKeys.metrics(), customerKeys.companies()]
      for (const key of seeded) queryClient.setQueryData(key, {})
      await userEvent.click(await screen.findByRole('button', { name: 'Archivar' }))
      await userEvent.click(screen.getByRole('button', { name: 'Archivar cliente' }))
      await screen.findByRole('button', { name: 'Restaurar' })
      for (const key of seeded) expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true)
    })
  })
})
