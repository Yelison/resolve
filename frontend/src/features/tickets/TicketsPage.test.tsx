import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inOrder, lockTimeoutRoute, retryAfterLockTimeout, type SentRequest } from '../../lib/lockTimeoutTesting'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { metrics, page, summary, ticket } from '../../test/ticketFixtures'
import { TicketsPage } from './TicketsPage'

function renderInbox(path = '/tickets') {
  const router = createMemoryRouter([{ path: '/tickets', element: <TicketsPage /> }], { initialEntries: [path] })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

const requestsTo = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url)).filter((url) => url.pathname === path)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Desde 1200 px hay vista previa; jsdom no implementa matchMedia y, por defecto, ninguna consulta coincide. */
function setWide(wide: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: wide && query === '(min-width: 1200px)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

/** `count` tickets de la página `pageIndex` (de 25 en 25), del más reciente al más antiguo. */
const manyTickets = (count: number, first = 1100) =>
  Array.from({ length: count }, (_, index) =>
    summary({
      id: `t-${first - index}`,
      number: first - index,
      subject: `Asunto ${first - index}`,
      updatedAt: '2026-10-04T15:12:00Z',
    }),
  )

const staffRoutes = (list: Parameters<typeof mockApi>[0][string]) => ({
  'GET /api/me': { body: adminMe },
  'GET /api/tickets/metrics': { body: metrics },
  'GET /api/tickets': list,
  'GET /api/assignees': { body: [{ id: 'u-laura', name: 'Laura Méndez', email: 'laura@acme.example' }] },
})

const row1048 = /#1048 · No puedo acceder a mi cuenta/

describe('TicketsPage para agentes', () => {
  it('muestra las vistas con su número, sin las métricas de cabecera, y las filas con su contenido', async () => {
    mockApi(
      staffRoutes({
        body: page([
          summary({
            lastMessage: {
              excerpt: 'Hola, María. Ya revisé tu cuenta.',
              authorName: 'Laura Méndez',
              internal: false,
              createdAt: '2026-10-04T15:10:00Z',
            },
          }),
          summary({
            id: 't-1047',
            number: 1047,
            subject: 'Error de pago',
            priority: 'low',
            assignee: null,
            lastMessage: {
              excerpt: 'Revisar con facturación',
              authorName: 'Daniel Santos',
              internal: true,
              createdAt: '2026-10-04T15:10:00Z',
            },
          }),
        ]),
      }),
    )
    renderInbox()
    const first = await screen.findByRole('link', { name: row1048 }, { timeout: 5000 })
    // Es el primer test del archivo: al arrancar en frío la carga puede superar el segundo por defecto.
    expect(first).toHaveAttribute('href', '/tickets/1048')
    expect(first).toHaveTextContent('María Pérez · Acme Studio')
    expect(first).toHaveTextContent('Hola, María. Ya revisé tu cuenta.')
    expect(first).toHaveTextContent('Urgente')
    expect(first).toHaveTextContent('Abierto')
    expect(first).toHaveTextContent('Laura Méndez')
    const second = screen.getByRole('link', { name: /#1047 · Error de pago/ })
    expect(second).toHaveTextContent('Nota interna: Revisar con facturación')
    expect(second).toHaveTextContent('Sin asignar')
    expect(second).not.toHaveTextContent('Urgente')

    // «Abiertos» no cuenta los resueltos: 34 de la vista «all» menos 10.
    expect(await screen.findByRole('link', { name: 'Abiertos 24' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Míos 4' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sin asignar 6' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resueltos 10' })).toBeInTheDocument()
    expect(screen.queryByText('Tickets abiertos')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nuevo ticket/ })).toHaveAttribute('href', '/tickets/nuevo')
  })

  it('pide «Abiertos» sin los resueltos y «Resueltos» con su vista', async () => {
    const fetchSpy = mockApi(staffRoutes({ body: page([summary()]) }))
    const router = renderInbox()
    await screen.findByRole('link', { name: row1048 })
    const open = requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams
    expect(open.get('view')).toBe('all')
    expect(open.getAll('status')).toEqual(['open', 'in_progress', 'waiting'])
    expect(open.get('size')).toBe('25')
    expect(open.get('sort')).toBe('updatedAt,desc')

    await userEvent.click(screen.getByRole('link', { name: /^Resueltos/ }))
    expect(router.state.location.search).toBe('?view=resolved')
    await waitFor(() => {
      const last = requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams
      expect(last.get('view')).toBe('resolved')
      expect(last.getAll('status')).toEqual([])
    })
    // «Resuelto» no se ofrece donde no cabe: en la vista de resueltos no hay filtro de estado.
    expect(screen.queryByRole('button', { name: 'Estado' })).not.toBeInTheDocument()
  })

  it('lleva la búsqueda y los filtros a la URL y a la API, y no pierde el ticket abierto', async () => {
    const fetchSpy = mockApi(staffRoutes({ body: page([summary()]) }))
    const router = renderInbox('/tickets?ticket=1048&page=3&sort=number,asc')
    await screen.findByRole('link', { name: row1048 })
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('number,asc')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar tickets' }), 'pago')
    await waitFor(() => expect(router.state.location.search).toBe('?q=pago&ticket=1048&sort=number%2Casc'))

    await userEvent.click(screen.getByRole('button', { name: 'Estado' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'En progreso' }))
    expect(router.state.location.search).toBe('?status=in_progress&q=pago&ticket=1048&sort=number%2Casc')
    expect(screen.getByRole('button', { name: 'Estado: En progreso' })).toBeInTheDocument()

    await waitFor(() => {
      const last = requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams
      expect(last.getAll('status')).toEqual(['in_progress'])
      expect(last.get('q')).toBe('pago')
      // El page de un enlace antiguo no cuenta (la lista carga de 25 en 25); su orden sí.
      expect(last.get('page')).toBe('0')
      expect(last.get('sort')).toBe('number,asc')
    })
  })

  it('una búsqueda en «Abiertos» no excluye los resueltos y la fila dice su estado', async () => {
    const fetchSpy = mockApi(
      staffRoutes((request) => {
        const statuses = new URL(request.url).searchParams.getAll('status')
        const resolved = summary({ id: 't-1040', number: 1040, subject: 'Factura resuelta', status: 'resolved' })
        // Como el servidor: sin filtro de estado, todos; con él, solo los pedidos.
        return { body: page([resolved].filter((ticket) => statuses.length === 0 || statuses.includes(ticket.status))) }
      }),
    )
    renderInbox('/tickets?q=factura')
    const link = await screen.findByRole('link', { name: /#1040 · Factura resuelta/ })
    expect(link).toHaveTextContent('Resuelto')
    expect(requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams.getAll('status')).toEqual([])
    // «Abiertos» sin búsqueda sigue siendo solo lo abierto.
    expect(screen.getByRole('link', { name: /^Abiertos/ })).toHaveAttribute('aria-current', 'true')
  })

  it('«Ordenar por» lleva el orden a la URL y a la API y vuelve a ofrecer los diez órdenes', async () => {
    const fetchSpy = mockApi(staffRoutes({ body: page([summary()]) }))
    const router = renderInbox()
    await screen.findByRole('link', { name: row1048 })
    const select = screen.getByRole('combobox', { name: 'Ordenar por' })
    expect(select).toHaveValue('updatedAt,desc')
    expect(within(select).getAllByRole('option')).toHaveLength(10)

    await userEvent.selectOptions(select, 'Número: mayor primero')
    expect(new URLSearchParams(router.state.location.search).get('sort')).toBe('number,desc')
    await waitFor(() =>
      expect(requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams.get('sort')).toBe('number,desc'),
    )
  })

  it('un enlace con un orden no válido vuelve al de por defecto', async () => {
    const fetchSpy = mockApi(staffRoutes({ body: page([summary()]) }))
    renderInbox('/tickets?sort=title,asc')
    await screen.findByRole('link', { name: row1048 })
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('updatedAt,desc')
    expect(new Set(requestsTo(fetchSpy, '/api/tickets').map((url) => url.searchParams.get('sort')))).toEqual(
      new Set(['updatedAt,desc']),
    )
  })

  it('con otro orden que la actualización la lista es plana, sin cabeceras, y el pie dice su orden', async () => {
    mockApi(staffRoutes({ body: page([summary(), summary({ id: 't-1047', number: 1047, subject: 'Error de pago' })]) }))
    renderInbox('/tickets?sort=priority,desc')
    await screen.findByRole('link', { name: row1048 })
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
    expect(screen.getByText('Mostrando 2 de 2 · ordenados por prioridad, los urgentes primero')).toBeInTheDocument()
  })

  it('con la actualización más antigua primero sigue agrupando por día y lo dice en el pie', async () => {
    mockApi(staffRoutes({ body: page([summary()]) }))
    renderInbox('/tickets?sort=updatedAt,asc')
    await screen.findByRole('link', { name: row1048 })
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
    expect(
      screen.getByText('Mostrando 1 de 1 · ordenados por actualización, los más antiguos primero'),
    ).toBeInTheDocument()
  })

  it('cambiar el responsable conserva la vista', async () => {
    const fetchSpy = mockApi(staffRoutes({ body: page([summary()]) }))
    const router = renderInbox('/tickets?view=mine')
    await screen.findByRole('link', { name: row1048 })

    await userEvent.click(screen.getByRole('button', { name: 'Responsable' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Laura Méndez' }))
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe('mine')
    expect(new URLSearchParams(router.state.location.search).get('assignee')).toBe('u-laura')
    await waitFor(() =>
      expect(requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams.get('assigneeId')).toBe('u-laura'),
    )
  })

  it('una URL con «resuelto» fuera de su vista no vacía la bandeja', async () => {
    const fetchSpy = mockApi(staffRoutes({ body: page([summary()]) }))
    renderInbox('/tickets?status=resolved')
    await screen.findByRole('link', { name: row1048 })
    expect(requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams.getAll('status')).toEqual([
      'open',
      'in_progress',
      'waiting',
    ])
  })

  it('agrupa por día en la zona de la organización con cabeceras', async () => {
    // 22:30 del 3 de octubre en Bogotá: un ticket de hace 4 h (UTC ya es el día 4) es «hoy» allí.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-04T03:30:00Z') })
    mockApi(
      staffRoutes({
        body: page([
          summary({ updatedAt: '2026-10-03T23:30:00Z' }),
          summary({ id: 't-1047', number: 1047, updatedAt: '2026-10-02T17:00:00Z' }),
          summary({ id: 't-1001', number: 1001, updatedAt: '2026-09-01T17:00:00Z' }),
        ]),
      }),
    )
    renderInbox()
    await screen.findByRole('link', { name: row1048 })
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Hoy',
      'Ayer',
      'Anteriores',
    ])
  })

  it('carga de 25 en 25, sin repetidos, y deja el foco en la primera fila nueva', async () => {
    const fetchSpy = mockApi(
      staffRoutes((request) => {
        const index = Number(new URL(request.url).searchParams.get('page'))
        // La segunda página repite el último ticket de la primera: una respuesta lo movió y desplazó las filas.
        return index === 0
          ? { body: page(manyTickets(25), 40, 0, 25) }
          : { body: page([...manyTickets(1, 1076), ...manyTickets(15, 1074)], 40, 1, 25) }
      }),
    )
    renderInbox()
    await screen.findByRole('link', { name: /#1100 · Asunto 1100/ })
    expect(screen.getByText('Mostrando 25 de 40 · ordenados por actualización')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cargar 15 más' }))
    expect(await screen.findByRole('link', { name: /#1074 · Asunto 1074/ })).toHaveFocus()
    expect(requestsTo(fetchSpy, '/api/tickets').at(-1)!.searchParams.get('page')).toBe('1')
    // 25 + 16 con uno repetido: 40 filas distintas.
    expect(screen.getAllByRole('link', { name: /#\d+ · Asunto/ })).toHaveLength(40)
    expect(screen.getByText('Mostrando 40 de 40 · ordenados por actualización')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cargar/ })).not.toBeInTheDocument()
  })

  it('una página siguiente vacía cierra la lista sin romper el pie', async () => {
    mockApi(
      staffRoutes((request) =>
        new URL(request.url).searchParams.get('page') === '0'
          ? { body: page(manyTickets(25), 60, 0, 25) }
          : { body: page([], 25, 1, 25) },
      ),
    )
    renderInbox()
    await screen.findByRole('link', { name: /#1100 · Asunto 1100/ })
    await userEvent.click(screen.getByRole('button', { name: 'Cargar 25 más' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Cargar/ })).not.toBeInTheDocument())
    expect(screen.getByText('Mostrando 25 de 25 · ordenados por actualización')).toBeInTheDocument()
  })

  it('si falla «Cargar más», lo dice, conserva lo cargado y permite reintentar', async () => {
    let failed = false
    mockApi(
      staffRoutes((request) => {
        if (new URL(request.url).searchParams.get('page') === '0') return { body: page(manyTickets(25), 40, 0, 25) }
        if (!failed) {
          failed = true
          return { status: 503, body: { status: 503, title: 'No disponible' } }
        }
        return { body: page(manyTickets(15, 1075), 40, 1, 25) }
      }),
    )
    renderInbox()
    await screen.findByRole('link', { name: /#1100 · Asunto 1100/ })
    await userEvent.click(screen.getByRole('button', { name: 'Cargar 15 más' }))
    expect(await screen.findByText('No pudimos cargar más tickets')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /#\d+ · Asunto/ })).toHaveLength(25)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar más tickets' }))
    await waitFor(() => expect(screen.getAllByRole('link', { name: /#\d+ · Asunto/ })).toHaveLength(40))
  })

  it('distingue una bandeja vacía, una vista vacía y una búsqueda sin resultados', async () => {
    mockApi(staffRoutes({ body: page([]) }))
    const router = renderInbox()
    expect(await screen.findByRole('heading', { name: 'No hay tickets abiertos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear ticket' })).toBeInTheDocument()

    await router.navigate('/tickets?view=mine')
    expect(await screen.findByRole('heading', { name: 'No tienes tickets asignados' })).toBeInTheDocument()

    await router.navigate('/tickets?priority=low')
    expect(await screen.findByRole('heading', { name: 'No encontramos tickets' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(router.state.location.search).toBe('')
  })

  it('permite reintentar cuando falla la carga', async () => {
    let attempts = 0
    mockApi(
      staffRoutes(() => {
        attempts += 1
        return attempts === 1
          ? { status: 503, body: { status: 503, title: 'No disponible' } }
          : { body: page([summary()]) }
      }),
    )
    renderInbox()
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('link', { name: row1048 })).toBeInTheDocument()
  })

  it('sin permisos para la lista no ofrece reintentar', async () => {
    mockApi(staffRoutes({ status: 403, body: { status: 403, title: 'Prohibido' } }))
    renderInbox()
    expect(await screen.findByRole('heading', { name: 'No tienes permiso para ver los tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('los números de las vistas fallan en silencio sin tocar la lista', async () => {
    mockApi({
      ...staffRoutes({ body: page([summary()]) }),
      'GET /api/tickets/metrics': { status: 500, body: { status: 500, title: 'Error' } },
    })
    renderInbox()
    expect(await screen.findByRole('link', { name: row1048 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abiertos' })).toBeInTheDocument()
  })

  it('resuelve un ticket desde su menú usando la versión actual (sin vista previa)', async () => {
    const fetchSpy = mockApi({
      ...staffRoutes({ body: page([summary()]) }),
      'GET /api/tickets/1048': { body: ticket({ version: 5 }) },
      'PATCH /api/tickets/1048': { body: ticket({ version: 6, status: 'resolved' }) },
    })
    renderInbox()
    await userEvent.click(await screen.findByRole('button', { name: 'Acciones del ticket #1048' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Marcar como resuelto' }))

    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Ticket #1048 resuelto')).toBeInTheDocument()
    const patch = fetchSpy.mock.calls.map(([input]) => input as Request).find((request) => request.method === 'PATCH')!
    expect(patch.headers.get('If-Match')).toBe('"5"')
    expect(patch.headers.get('Content-Type')).toBe('application/merge-patch+json')
    expect(await patch.clone().json()).toEqual({ status: 'resolved' })
  })

  it('dos acciones rápidas seguidas en filas distintas avisan cada una de su resultado', async () => {
    // Un solo hook de mutación para toda la lista dejaría sin aviso a la primera: TanStack solo llama a los callbacks de
    // la última llamada. La primera termina después de lanzar la segunda.
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    mockApi({
      ...staffRoutes({
        body: page([summary(), summary({ id: 't-1047', number: 1047, subject: 'Error de pago' })]),
      }),
      'GET /api/tickets/1048': { body: ticket({ version: 5 }) },
      'GET /api/tickets/1047': { body: ticket({ number: 1047, id: 't-1047', version: 2 }) },
      'PATCH /api/tickets/1048': async () => {
        await held
        return { body: ticket({ version: 6, status: 'resolved' }) }
      },
      'PATCH /api/tickets/1047': { body: ticket({ number: 1047, id: 't-1047', version: 3 }) },
    })
    renderInbox()
    await userEvent.click(await screen.findByRole('button', { name: 'Acciones del ticket #1048' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Marcar como resuelto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Acciones del ticket #1047' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Asignarme' }))
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Te asignaste el ticket #1047')).toBeInTheDocument()
    release()
    expect(await within(region).findByText('Ticket #1048 resuelto')).toBeInTheDocument()
  })

  it('por debajo de 1200 px no hay vista previa ni pide la conversación', async () => {
    const fetchSpy = mockApi(staffRoutes({ body: page([summary()]) }))
    renderInbox('/tickets?ticket=1048')
    await screen.findByRole('link', { name: row1048 })
    expect(screen.queryByRole('region', { name: 'Vista previa del ticket' })).not.toBeInTheDocument()
    expect(requestsTo(fetchSpy, '/api/tickets/1048')).toHaveLength(0)
  })
})

describe('TicketsPage con vista previa (desde 1200 px)', () => {
  const previewRoutes = (patch?: Parameters<typeof mockApi>[0][string]) => ({
    ...staffRoutes({ body: page([summary(), summary({ id: 't-1047', number: 1047, subject: 'Error de pago' })]) }),
    'GET /api/tickets/1048': { body: ticket({ version: 5 }) },
    'GET /api/tickets/1048/messages': {
      body: [
        {
          id: 'm-1',
          body: 'Hola, María. ¿Me confirmas cuál usas ahora?',
          visibility: 'public',
          author: { id: 'u-laura', name: 'Laura Méndez', kind: 'agent' },
          createdAt: '2026-10-04T15:10:00Z',
        },
      ],
    },
    'GET /api/tickets/1047': { body: ticket({ number: 1047, id: 't-1047', subject: 'Error de pago' }) },
    'GET /api/tickets/1047/messages': { body: [] },
    ...(patch ? { 'PATCH /api/tickets/1048': patch } : {}),
  })

  it('sin selección dice «Ningún ticket seleccionado» y no pide ningún detalle', async () => {
    setWide(true)
    const fetchSpy = mockApi(previewRoutes())
    renderInbox()
    await screen.findByRole('link', { name: row1048 })
    const panel = screen.getByRole('region', { name: 'Vista previa del ticket' })
    expect(within(panel).getByRole('heading', { name: 'Ningún ticket seleccionado' })).toBeInTheDocument()
    expect(requestsTo(fetchSpy, '/api/tickets/1048')).toHaveLength(0)
  })

  it('elegir una fila la guarda en la URL, la marca y abre la vista previa con «Abrir completo»', async () => {
    setWide(true)
    mockApi(previewRoutes())
    const router = renderInbox()
    await userEvent.click(await screen.findByRole('link', { name: row1048 }))

    expect(router.state.location.search).toBe('?ticket=1048')
    expect(screen.getByRole('link', { name: row1048 })).toHaveAttribute('aria-current', 'true')
    const panel = screen.getByRole('region', { name: 'Vista previa del ticket' })
    expect(await within(panel).findByRole('heading', { name: 'No puedo acceder a mi cuenta' })).toBeInTheDocument()
    expect(within(panel).getByText('Hola, María. ¿Me confirmas cuál usas ahora?')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Abrir completo' })).toHaveAttribute('href', '/tickets/1048')
    expect(within(panel).getByRole('combobox', { name: 'Estado' })).toHaveValue('open')
    expect(within(panel).getByRole('combobox', { name: 'Responsable' })).toHaveValue('u-laura')
    // El compositor que ya existe, con la respuesta al cliente y la nota interna.
    expect(within(panel).getByRole('radio', { name: 'Nota interna' })).toBeInTheDocument()
  })

  it('cambiar el estado desde la vista previa usa el mismo PATCH con If-Match', async () => {
    setWide(true)
    const fetchSpy = mockApi(previewRoutes({ body: ticket({ version: 6, status: 'in_progress' }) }))
    renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Estado' }), 'En progreso')

    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Estado: En progreso')).toBeInTheDocument()
    const patch = fetchSpy.mock.calls.map(([input]) => input as Request).find((request) => request.method === 'PATCH')!
    expect(patch.headers.get('If-Match')).toBe('"5"')
    expect(await patch.clone().json()).toEqual({ status: 'in_progress' })
  })

  it('un 412 en la vista previa avisa del conflicto', async () => {
    setWide(true)
    mockApi(previewRoutes({ status: 412, body: { status: 412, title: 'El recurso cambió' } }))
    renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Estado' }), 'Resuelto')
    expect(await within(panel).findByText('El ticket cambió mientras lo editabas')).toBeInTheDocument()
  })

  it('un ticket que no existe lo dice en el panel y permite quitar la selección', async () => {
    setWide(true)
    mockApi({
      ...previewRoutes(),
      'GET /api/tickets/999': { status: 404, body: { status: 404, title: 'No encontrado' } },
    })
    const router = renderInbox('/tickets?ticket=999')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    expect(await within(panel).findByRole('heading', { name: 'No existe el ticket #999' })).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Quitar la selección' }))
    expect(router.state.location.search).toBe('')
    expect(await within(panel).findByRole('heading', { name: 'Ningún ticket seleccionado' })).toBeInTheDocument()
  })

  it('un error al cargar el ticket permite reintentar sin tocar la lista', async () => {
    setWide(true)
    let attempts = 0
    mockApi({
      ...previewRoutes(),
      'GET /api/tickets/1048': () => {
        attempts += 1
        return attempts <= 1 ? { status: 500, body: { status: 500, title: 'Error' } } : { body: ticket() }
      },
    })
    renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    await userEvent.click(await within(panel).findByRole('button', { name: 'Reintentar cargar el ticket #1048' }))
    expect(await within(panel).findByRole('heading', { name: 'No puedo acceder a mi cuenta' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: row1048 })).toBeInTheDocument()
  })

  it('con teclado, una sola parada de Tab; las flechas mueven el foco y Enter abre', async () => {
    setWide(true)
    mockApi(previewRoutes())
    const router = renderInbox()
    const first = await screen.findByRole('link', { name: row1048 })
    const second = screen.getByRole('link', { name: /#1047 · Error de pago/ })
    expect(first).toHaveAttribute('tabindex', '0')
    expect(second).toHaveAttribute('tabindex', '-1')

    first.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(second).toHaveFocus()
    // La fila enfocada pasa a ser la parada de Tab.
    expect(second).toHaveAttribute('tabindex', '0')
    expect(first).toHaveAttribute('tabindex', '-1')
    await userEvent.keyboard('{ArrowDown}')
    expect(second).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(first).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(second).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(first).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(router.state.location.search).toBe('?ticket=1048')
    // Abrir no roba el foco: sigue en la fila, y desde ahí se sigue recorriendo la lista.
    expect(first).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(second).toHaveFocus()
  })

  it('al cambiar de ticket reinicia el borrador y los errores de la vista previa', async () => {
    setWide(true)
    mockApi(previewRoutes())
    renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    await within(panel).findByRole('heading', { name: 'No puedo acceder a mi cuenta' })
    await userEvent.click(screen.getByRole('link', { name: /#1047 · Error de pago/ }))
    expect(await within(panel).findByRole('heading', { name: 'Error de pago' })).toBeInTheDocument()
    expect(within(panel).getAllByRole('heading', { level: 2 })).toHaveLength(1)
  })

  it('guardar el estado no saca el foco del selector ni admite otro cambio mientras tanto', async () => {
    setWide(true)
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const fetchSpy = mockApi(
      previewRoutes(async () => {
        await held
        return { body: ticket({ version: 6, status: 'in_progress' }) }
      }),
    )
    renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    const status = await within(panel).findByRole('combobox', { name: 'Estado' })
    status.focus()
    await userEvent.selectOptions(status, 'En progreso')
    // Durante el PATCH el campo sigue ahí, con el foco, marcado como no disponible; un segundo cambio se ignora.
    await waitFor(() => expect(status).toHaveAttribute('aria-disabled', 'true'))
    expect(status).not.toBeDisabled()
    expect(status).toHaveFocus()
    await userEvent.selectOptions(status, 'Resuelto')
    release()
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Estado: En progreso')).toBeInTheDocument()
    await waitFor(() => expect(status).not.toHaveAttribute('aria-disabled'))
    expect(status).toHaveFocus()
    const patches = fetchSpy.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => request.method === 'PATCH')
    expect(patches).toHaveLength(1)
  })

  it('un 412 al guardar tampoco deja el foco en body', async () => {
    setWide(true)
    mockApi(previewRoutes({ status: 412, body: { status: 412, title: 'El recurso cambió' } }))
    renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    const responsible = await within(panel).findByRole('combobox', { name: 'Responsable' })
    await waitFor(() => expect(responsible).toBeEnabled())
    responsible.focus()
    await userEvent.selectOptions(responsible, 'Sin asignar')
    expect(await within(panel).findByText('El ticket cambió mientras lo editabas')).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
    expect(responsible).toHaveFocus()
  })

  it('tras «Reintentar» con éxito, el foco vuelve al panel aunque la bandeja no se repinte', async () => {
    setWide(true)
    let attempts = 0
    mockApi({
      ...previewRoutes(),
      'GET /api/tickets/1048': () => {
        attempts += 1
        return attempts <= 1 ? { status: 500, body: { status: 500, title: 'Error' } } : { body: ticket({ version: 5 }) }
      },
    })
    renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    const retry = await within(panel).findByRole('button', { name: 'Reintentar cargar el ticket #1048' })
    retry.focus()
    await userEvent.keyboard('{Enter}')
    // El botón desaparece al cargar el ticket: es un cambio interno de la vista previa, no de la bandeja.
    expect(await within(panel).findByRole('heading', { name: 'No puedo acceder a mi cuenta' })).toBeInTheDocument()
    await waitFor(() => expect(panel).toHaveFocus())
  })

  it('«Quitar la selección» deja el foco en el panel, no en body', async () => {
    setWide(true)
    mockApi({
      ...previewRoutes(),
      'GET /api/tickets/999': { status: 404, body: { status: 404, title: 'No encontrado' } },
    })
    renderInbox('/tickets?ticket=999')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    await userEvent.click(await within(panel).findByRole('button', { name: 'Quitar la selección' }))
    expect(await within(panel).findByRole('heading', { name: 'Ningún ticket seleccionado' })).toBeInTheDocument()
    expect(panel).toHaveFocus()
  })

  it('al volver a otro ticket con «Atrás» y el foco en la vista previa, el foco no se pierde', async () => {
    setWide(true)
    mockApi(previewRoutes())
    const router = renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    const status = await within(panel).findByRole('combobox', { name: 'Estado' })
    status.focus()
    await router.navigate('/tickets?ticket=1047')
    expect(await within(panel).findByRole('heading', { name: 'Error de pago' })).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
    expect(panel).toHaveFocus()
  })

  it('un clic fuera de los controles suelta el foco a propósito: no se lo devuelve al panel', async () => {
    setWide(true)
    mockApi(previewRoutes())
    const router = renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    const status = await within(panel).findByRole('combobox', { name: 'Estado' })
    status.focus()
    await userEvent.click(document.body)
    await router.navigate('/tickets?ticket=1047')
    await within(panel).findByRole('heading', { name: 'Error de pago' })
    expect(panel).not.toHaveFocus()
  })
})

describe('TicketsPage y el historial del navegador', () => {
  it('el buscador refleja la búsqueda de la URL al navegar', async () => {
    mockApi(staffRoutes({ body: page([summary()]) }))
    const router = renderInbox('/tickets?q=pago')
    const search = await screen.findByRole('searchbox', { name: 'Buscar tickets' })
    expect(search).toHaveValue('pago')
    await router.navigate('/tickets?q=acceso')
    await waitFor(() => expect(search).toHaveValue('acceso'))
    await router.navigate('/tickets')
    await waitFor(() => expect(search).toHaveValue(''))
  })
})

describe('TicketsPage para clientes', () => {
  const customerTicket = summary({
    lastMessage: {
      excerpt: 'Ya revisé tu cuenta: el correo iba a una dirección antigua.',
      authorName: 'Laura Méndez',
      internal: false,
      createdAt: '2026-10-04T15:10:00Z',
    },
  })
  const customerRoutes = {
    'GET /api/me': { body: customerMe },
    'GET /api/tickets': (request: Request) =>
      new URL(request.url).searchParams.get('size') === '1'
        ? { body: page([], new URL(request.url).searchParams.get('view') === 'resolved' ? 4 : 2, 0, 1) }
        : {
            body: page([
              customerTicket,
              summary({
                id: 't-1021',
                number: 1021,
                status: 'waiting',
                assignee: null,
                lastMessage: {
                  excerpt: 'Gracias, quedo atenta.',
                  authorName: 'María Pérez',
                  internal: false,
                  createdAt: '2026-10-04T15:10:00Z',
                },
              }),
            ]),
          },
  }

  it('se titula «Mis solicitudes», con sus píldoras y sin nada de equipo', async () => {
    const fetchSpy = mockApi(customerRoutes)
    renderInbox()
    await screen.findByRole('link', { name: row1048 })
    expect(screen.getByRole('heading', { level: 1, name: 'Mis solicitudes' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Abiertas 2' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Resueltas 4' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar tickets' })).toHaveAttribute(
      'placeholder',
      'Buscar en tus solicitudes…',
    )
    // Sin «+ Nueva solicitud» (los clientes no crean tickets en esta versión), vistas de equipo, filtros ni acciones.
    expect(screen.queryByRole('link', { name: /Nuevo ticket|Nueva solicitud/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Míos|Sin asignar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Estado|Prioridad|Responsable/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Acciones del ticket/ })).not.toBeInTheDocument()
    expect(requestsTo(fetchSpy, '/api/tickets/metrics')).toHaveLength(0)
  })

  it('cada fila dice quién la atiende, su estado en primera persona y quién escribió el último mensaje', async () => {
    mockApi(customerRoutes)
    renderInbox()
    const first = await screen.findByRole('link', { name: row1048 })
    expect(first).toHaveTextContent('Laura Méndez')
    expect(first).toHaveTextContent('Te atiende Laura')
    expect(first).toHaveTextContent('Laura: Ya revisé tu cuenta')
    expect(first).toHaveTextContent('Abierta')
    expect(first).not.toHaveTextContent('Urgente')
    const second = screen.getByRole('link', { name: /#1021/ })
    expect(second).toHaveTextContent('Soporte')
    expect(second).toHaveTextContent('Pendiente de asignar')
    expect(second).toHaveTextContent('Tú: Gracias, quedo atenta.')
    expect(second).toHaveTextContent('Esperando tu respuesta')
  })

  it('ignora vistas de equipo, responsable, prioridad y estado de la URL', async () => {
    const fetchSpy = mockApi(customerRoutes)
    renderInbox('/tickets?view=mine&assignee=none&priority=low&status=open')
    await screen.findByRole('link', { name: row1048 })
    const params = requestsTo(fetchSpy, '/api/tickets')
      .filter((url) => url.searchParams.get('size') === '25')
      .at(-1)!.searchParams
    expect(params.get('view')).toBe('all')
    expect(params.has('assigneeId')).toBe(false)
    expect(params.getAll('priority')).toEqual([])
    expect(params.getAll('status')).toEqual(['open', 'in_progress', 'waiting'])
  })

  it('la vista previa es de solo lectura: estado en una etiqueta, sin controles ni compositor', async () => {
    setWide(true)
    mockApi({
      ...customerRoutes,
      'GET /api/tickets/1048': { body: ticket() },
      'GET /api/tickets/1048/messages': {
        body: [
          {
            id: 'm-1',
            body: 'Ya revisé tu cuenta.',
            visibility: 'public',
            author: { id: 'u-laura', name: 'Laura Méndez', kind: 'agent' },
            createdAt: '2026-10-04T15:10:00Z',
          },
        ],
      },
    })
    renderInbox('/tickets?ticket=1048')
    const panel = await screen.findByRole('region', { name: 'Vista previa del ticket' })
    expect(await within(panel).findByText('Ya revisé tu cuenta.')).toBeInTheDocument()
    expect(within(panel).getByText(/te atiende Laura Méndez/)).toBeInTheDocument()
    expect(within(panel).getByText('Abierta')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Abrir completo' })).toBeInTheDocument()
    expect(within(panel).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(panel).queryByRole('radio', { name: 'Nota interna' })).not.toBeInTheDocument()
  })
})

describe('TicketsPage y la zona de la organización', () => {
  it('cuenta el «ayer» de cada fila en la zona de la organización', async () => {
    // 11:00 del día 2 en Ciudad de México; ahora son las 23:30 del día 3 allí (36 h y 30 min después). Contar días de UTC daría «anteayer».
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-04T05:30:00Z') })
    mockApi({
      'GET /api/me': {
        body: { ...adminMe, organization: { ...adminMe.organization, timeZone: 'America/Mexico_City' } },
      },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary({ updatedAt: '2026-10-02T17:00:00Z' })]) },
      'GET /api/assignees': { body: [] },
    })
    renderInbox()
    expect((await screen.findAllByText('ayer')).length).toBeGreaterThan(0)
    expect(screen.queryByText('anteayer')).not.toBeInTheDocument()
  })
})

describe('TicketsPage con un 503 de bloqueo en una acción de fila', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  /** La bandeja; el detalle devuelve la versión 5 en la primera lectura y la 6 en las siguientes. */
  function inbox(seen: SentRequest[], ...replies: Parameters<typeof inOrder>[1][]) {
    let reads = 0
    return mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/metrics': { body: metrics },
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/assignees': { body: [] },
      'GET /api/tickets/1048': () => {
        reads += 1
        return { body: ticket({ version: reads === 1 ? 5 : 6 }) }
      },
      'PATCH /api/tickets/1048': inOrder(seen, ...replies),
    })
  }

  async function resolveFromMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Acciones del ticket #1048' }))
    await user.click(screen.getByRole('menuitem', { name: 'Marcar como resuelto' }))
  }

  it('ofrece «Reintentar» en el aviso y repite el PATCH con la versión de la primera lectura', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const seen: SentRequest[] = []
    const fetchSpy = inbox(seen, lockTimeoutRoute(), { body: ticket({ version: 6, status: 'resolved' }) })
    renderInbox()
    await resolveFromMenu(user)

    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('No se pudo actualizar el ticket #1048')).toBeInTheDocument()
    expect(
      within(region).getByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).toBeInTheDocument()
    const retry = within(region).getByRole('button', { name: 'Reintentar actualizar el ticket #1048' })
    // Antes de pasar Retry-After la acción no se activa y el aviso sigue ahí.
    expect(retry).toHaveAttribute('aria-disabled', 'true')
    await user.click(retry)
    expect(seen).toHaveLength(1)
    await retryAfterLockTimeout(user, 'Reintentar actualizar el ticket #1048')
    // El foco vuelve al menú de la fila, no a `body`.
    expect(screen.getByRole('button', { name: 'Acciones del ticket #1048' })).toHaveFocus()

    expect(await within(region).findByText('Ticket #1048 resuelto')).toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    expect(seen[0]?.ifMatch).toBe('"5"')
    // No se volvió a leer el ticket: con la versión 6 el reintento habría pisado el cambio ajeno.
    expect(
      fetchSpy.mock.calls.filter(
        ([input]) =>
          (input as Request).method === 'GET' && new URL((input as Request).url).pathname === '/api/tickets/1048',
      ),
    ).toHaveLength(1)
  })

  it('si otra persona guardó en medio, el reintento recibe el 412 y se explica como siempre', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const seen: SentRequest[] = []
    inbox(seen, lockTimeoutRoute(), { status: 412, body: { status: 412, title: 'El recurso cambió' } })
    renderInbox()
    await resolveFromMenu(user)
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    await retryAfterLockTimeout(user, 'Reintentar actualizar el ticket #1048')

    expect(
      await within(region).findByText('Otra persona lo cambió a la vez. Revisa los cambios e inténtalo de nuevo.'),
    ).toBeInTheDocument()
    expect(seen.map((request) => request.ifMatch)).toEqual(['"5"', '"5"'])
  })

  it('un 429 en una acción de fila lo dice en el aviso, sin «Reintentar»', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    inbox([], {
      status: 429,
      headers: { 'Retry-After': '30' },
      body: { status: 429, title: 'Demasiadas escrituras' },
    })
    renderInbox()
    await resolveFromMenu(user)
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('No se pudo actualizar el ticket #1048')).toBeInTheDocument()
    expect(within(region).getByText('Has hecho muchos cambios seguidos; espera un momento.')).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
  })
})
