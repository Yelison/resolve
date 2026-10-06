import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inOrder, lockTimeoutRoute, retryAfterLockTimeout, type SentRequest } from '../../lib/lockTimeoutTesting'
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

  it('al pasar de un cliente a otro, con el segundo en caché, el borrador de notas no viaja', async () => {
    api({
      'GET /api/customers/c-maria': { body: customerDetail() },
      'GET /api/customers/c-luis': {
        body: customerDetail({ id: 'c-luis', name: 'Luis Gómez', notes: 'Notas de Luis' }),
      },
    })
    const router = createMemoryRouter([{ path: '/clientes/:id', element: <CustomerDetailPage /> }], {
      initialEntries: ['/clientes/c-maria'],
    })
    const { queryClient } = renderWithProviders(<RouterProvider router={router} />)
    queryClient.setQueryData(
      customerKeys.detail('c-luis'),
      customerDetail({ id: 'c-luis', name: 'Luis Gómez', notes: 'Notas de Luis' }),
    )
    await userEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Notas internas' }), ' borrador de María')
    await router.navigate('/clientes/c-luis')
    expect(await screen.findByRole('heading', { level: 1, name: 'Luis Gómez' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Notas' }))
    expect(screen.getByRole('textbox', { name: 'Notas internas' })).toHaveValue('Notas de Luis')
  })

  it('si el cliente pasa a archivado tras un 412, las notas muestran el aviso de archivado y no el ámbar', async () => {
    let reads = 0
    api({
      'GET /api/customers/c-maria': () => {
        reads += 1
        return { body: customerDetail(reads === 1 ? {} : { archived: true, version: 4 }) }
      },
      'PATCH /api/customers/c-maria': { status: 412, body: { status: 412, title: 'El recurso cambió' } },
    })
    renderDetail()
    await userEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Notas internas' }), ' Extra.')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar notas' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Notas internas' })).toBeDisabled())
    expect(screen.getAllByText('El cliente está archivado').length).toBeGreaterThan(0)
    // Con el borrador abierto, el aviso de archivado se anuncia (región viva).
    expect(screen.getByRole('alert')).toHaveTextContent('El cliente está archivado')
    expect(screen.queryByText('El cliente cambió mientras editabas las notas')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar notas' })).toBeDisabled()
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
  describe('dar acceso al portal', () => {
    const none = () => customerDetail({ portalAccess: 'none' })

    it('un administrador ve el botón solo si el cliente no tiene acceso', async () => {
      api({ 'GET /api/customers/c-maria': { body: none() } })
      renderDetail()
      expect(await screen.findByRole('button', { name: 'Dar acceso al portal' })).toBeInTheDocument()
    })

    it.each([
      ['con la invitación pendiente', customerDetail({ portalAccess: 'invited' })],
      ['con el acceso activo', customerDetail({ portalAccess: 'active' })],
      ['archivado', customerDetail({ portalAccess: 'none', archived: true, archivedAt: '2026-10-05T10:00:00Z' })],
    ])('no lo ofrece %s', async (_case, customer) => {
      api({ 'GET /api/customers/c-maria': { body: customer } })
      renderDetail()
      await screen.findByRole('heading', { level: 1, name: 'María Pérez' })
      expect(screen.queryByRole('button', { name: 'Dar acceso al portal' })).not.toBeInTheDocument()
    })

    it('un agente no lo ve', async () => {
      api({ 'GET /api/me': { body: agentMe }, 'GET /api/customers/c-maria': { body: none() } })
      renderDetail()
      await screen.findByRole('heading', { level: 1, name: 'María Pérez' })
      expect(screen.queryByRole('button', { name: 'Dar acceso al portal' })).not.toBeInTheDocument()
    })

    it('pide confirmación, avisa solo tras la respuesta y actualiza la insignia desde el servidor', async () => {
      let detail = none()
      const fetchSpy = api({
        'GET /api/customers/c-maria': () => ({ body: detail }),
        'POST /api/customers/c-maria/invite': () => {
          detail = customerDetail({ portalAccess: 'invited', version: 4 })
          return {
            status: 201,
            body: {
              id: 'u-maria',
              name: 'María Pérez',
              email: 'maria@cliente.example',
              role: 'customer',
              status: 'invited',
              openTickets: 0,
              joinedAt: null,
              invitedAt: '2026-10-05T10:00:00Z',
            },
          }
        },
      })
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: 'Dar acceso al portal' }))
      const dialog = screen.getByRole('dialog', { name: 'Dar acceso al portal' })
      expect(dialog).toHaveTextContent('todavía no enviamos correos de invitación')
      expect(sent(fetchSpy, 'POST')).toBeUndefined()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Dar acceso' }))
      expect(await screen.findByText('Invitación creada')).toBeInTheDocument()
      expect(await screen.findByText('Invitación pendiente')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Dar acceso al portal' })).not.toBeInTheDocument()
    })

    it('un 409 muestra su detalle en el diálogo, sin avisar de éxito', async () => {
      api({
        'GET /api/customers/c-maria': { body: none() },
        'POST /api/customers/c-maria/invite': {
          status: 409,
          body: { status: 409, title: 'Conflicto', detail: 'El correo pertenece a un miembro del equipo.' },
        },
      })
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: 'Dar acceso al portal' }))
      const dialog = screen.getByRole('dialog', { name: 'Dar acceso al portal' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Dar acceso' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('El correo pertenece a un miembro del equipo.')
      expect(screen.queryByText('Invitación creada')).not.toBeInTheDocument()
    })

    it('un 403 muestra su detalle y relee la sesión: el botón desaparece si ya no eres administrador', async () => {
      let me: typeof adminMe | typeof agentMe = adminMe
      api({
        'GET /api/me': () => ({ body: me }),
        'GET /api/customers/c-maria': { body: none() },
        'POST /api/customers/c-maria/invite': () => {
          me = agentMe
          return { status: 403, body: { status: 403, title: 'Prohibido', detail: 'Tu rol no permite esta acción.' } }
        },
      })
      renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: 'Dar acceso al portal' }))
      const dialog = screen.getByRole('dialog', { name: 'Dar acceso al portal' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Dar acceso' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tu rol no permite esta acción.')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Dar acceso al portal' })).not.toBeInTheDocument(),
      )
      // El disparador ya no existe: el foco va al título de la página en lugar de perderse en el body.
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
    })

    it('un 409 relee el detalle del cliente', async () => {
      api({
        'GET /api/customers/c-maria': { body: none() },
        'POST /api/customers/c-maria/invite': {
          status: 409,
          body: { status: 409, title: 'Conflicto', detail: 'El cliente ya tiene acceso al portal.' },
        },
      })
      const { queryClient } = renderDetail()
      await userEvent.click(await screen.findByRole('button', { name: 'Dar acceso al portal' }))
      const dialog = screen.getByRole('dialog', { name: 'Dar acceso al portal' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Dar acceso' }))
      await within(dialog).findByRole('alert')
      await waitFor(() => expect(queryClient.getQueryState(customerKeys.detail('c-maria'))?.dataUpdateCount).toBe(2))
    })
  })
})

describe('CustomerDetailPage con un 503 de bloqueo', () => {
  const LOCK_MESSAGE = 'Otra persona está guardando este recurso; vuelve a intentarlo.'
  const archivedCustomer = () => customerDetail({ archived: true, archivedAt: '2026-10-05T10:00:00Z', version: 4 })

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  async function typeNotes(user: ReturnType<typeof setup>) {
    await user.click(await screen.findByRole('tab', { name: 'Notas' }))
    const notes = await screen.findByRole('textbox', { name: 'Notas internas' })
    await user.type(notes, ' Extra.')
    await user.click(screen.getByRole('button', { name: 'Guardar notas' }))
    return notes
  }

  it('las notas conservan el texto, ofrecen «Reintentar» y repiten el PATCH con la misma versión', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    api({
      'PATCH /api/customers/c-maria': inOrder(seen, lockTimeoutRoute(), {
        body: customerDetail({ notes: 'Prefiere que la llamen por la mañana. Extra.', version: 4 }),
      }),
    })
    renderDetail()
    const notes = await typeNotes(user)
    expect(await screen.findByText(LOCK_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('No se pudieron guardar las notas')).not.toBeInTheDocument()
    expect(notes).toHaveValue('Prefiere que la llamen por la mañana. Extra.')

    await retryAfterLockTimeout(user, 'Reintentar guardar las notas')
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Cambios guardados')).toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    expect(seen[0]?.ifMatch).toBe('"3"')
  })

  it('las notas: si otra persona guardó entretanto, el reintento lleva la versión original y recibe el 412', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    let reads = 0
    api({
      'GET /api/customers/c-maria': () => {
        reads += 1
        return { body: customerDetail(reads === 1 ? {} : { company: 'Nueva SL', version: 4 }) }
      },
      'PATCH /api/customers/c-maria': inOrder(seen, lockTimeoutRoute(), {
        status: 412,
        body: { status: 412, title: 'El recurso cambió' },
      }),
    })
    renderDetail()
    const notes = await typeNotes(user)
    await waitFor(() => expect(screen.getByText('Nueva SL', { selector: 'dd' })).toBeInTheDocument())
    await retryAfterLockTimeout(user, 'Reintentar guardar las notas')

    expect(await screen.findByText('El cliente cambió mientras editabas las notas')).toBeInTheDocument()
    expect(screen.queryByText(LOCK_MESSAGE)).not.toBeInTheDocument()
    expect(notes).toHaveValue('Prefiere que la llamen por la mañana. Extra.')
    expect(seen.map((request) => request.ifMatch)).toEqual(['"3"', '"3"'])
  })

  it('archivar mantiene abierto el diálogo con «Reintentar» y repite la misma petición', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    api({
      'POST /api/customers/c-maria/archive': inOrder(seen, lockTimeoutRoute(), { body: archivedCustomer() }),
    })
    renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Archivar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Archivar a este cliente?' })
    await user.click(within(dialog).getByRole('button', { name: 'Archivar cliente' }))

    expect(await within(dialog).findByText(LOCK_MESSAGE)).toBeInTheDocument()
    await retryAfterLockTimeout(user, 'Reintentar archivar el cliente')
    expect(await screen.findByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
  })

  it('archivar: si el reintento recibe un 409 se explica como siempre', async () => {
    const user = setup()
    api({
      'POST /api/customers/c-maria/archive': inOrder([], lockTimeoutRoute(), {
        status: 409,
        body: { status: 409, title: 'Conflicto', detail: 'El cliente ya estaba archivado.' },
      }),
    })
    renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Archivar' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archivar cliente' }))
    await retryAfterLockTimeout(user, 'Reintentar archivar el cliente')
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('El cliente ya estaba archivado')).toBeInTheDocument()
    expect(screen.queryByText(LOCK_MESSAGE)).not.toBeInTheDocument()
  })

  it('restaurar ofrece «Reintentar» bajo el encabezado y repite la misma petición', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    api({
      'GET /api/customers/c-maria': { body: archivedCustomer() },
      'POST /api/customers/c-maria/restore': inOrder(seen, lockTimeoutRoute(), {
        body: customerDetail({ version: 5 }),
      }),
    })
    renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }))
    expect(await screen.findByText(LOCK_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('No se pudo restaurar el cliente')).not.toBeInTheDocument()
    await retryAfterLockTimeout(user, 'Reintentar restaurar el cliente')
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Cliente restaurado')).toBeInTheDocument()
    expect(seen).toHaveLength(2)
  })

  it('dar acceso al portal mantiene abierto el diálogo con «Reintentar» y repite la misma petición', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    api({
      'GET /api/customers/c-maria': { body: customerDetail({ portalAccess: 'none' }) },
      'POST /api/customers/c-maria/invite': inOrder(seen, lockTimeoutRoute(), {
        status: 201,
        body: {
          id: 'u-maria',
          name: 'María Pérez',
          email: 'maria@cliente.example',
          role: 'customer',
          status: 'invited',
          openTickets: 0,
          joinedAt: null,
          invitedAt: '2026-10-05T10:00:00Z',
        },
      }),
    })
    renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Dar acceso al portal' }))
    const dialog = screen.getByRole('dialog', { name: 'Dar acceso al portal' })
    await user.click(within(dialog).getByRole('button', { name: 'Dar acceso' }))
    expect(await within(dialog).findByText(LOCK_MESSAGE)).toBeInTheDocument()
    expect(within(dialog).queryByText('No se pudo dar acceso al portal')).not.toBeInTheDocument()
    await retryAfterLockTimeout(user, 'Reintentar dar acceso al portal')
    expect(await screen.findByText('Invitación creada')).toBeInTheDocument()
    expect(seen).toHaveLength(2)
  })

  describe('con un 429 de la demostración', () => {
    const tooMany = {
      status: 429,
      headers: { 'Retry-After': '30' },
      body: { status: 429, title: 'Demasiadas escrituras' },
    }

    it('las notas lo dicen en el aviso y conservan el texto', async () => {
      const user = setup()
      api({ 'PATCH /api/customers/c-maria': tooMany })
      renderDetail()
      const notes = await typeNotes(user)
      const region = screen.getByRole('region', { name: 'Notificaciones' })
      expect(await within(region).findByText('No se pudieron guardar las notas')).toBeInTheDocument()
      expect(within(region).getByText('Has hecho muchos cambios seguidos; espera un momento.')).toBeInTheDocument()
      expect(notes).toHaveValue('Prefiere que la llamen por la mañana. Extra.')
    })

    it('archivar lo dice en el aviso', async () => {
      const user = setup()
      api({ 'POST /api/customers/c-maria/archive': tooMany })
      renderDetail()
      await user.click(await screen.findByRole('button', { name: 'Archivar' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archivar cliente' }))
      const region = screen.getByRole('region', { name: 'Notificaciones' })
      expect(await within(region).findByText('No se pudo archivar el cliente')).toBeInTheDocument()
      expect(within(region).getByText('Has hecho muchos cambios seguidos; espera un momento.')).toBeInTheDocument()
    })

    it('restaurar lo dice en el aviso', async () => {
      const user = setup()
      api({
        'GET /api/customers/c-maria': { body: archivedCustomer() },
        'POST /api/customers/c-maria/restore': tooMany,
      })
      renderDetail()
      await user.click(await screen.findByRole('button', { name: 'Restaurar' }))
      const region = screen.getByRole('region', { name: 'Notificaciones' })
      expect(await within(region).findByText('No se pudo restaurar el cliente')).toBeInTheDocument()
      expect(within(region).getByText('Has hecho muchos cambios seguidos; espera un momento.')).toBeInTheDocument()
    })
  })
})
