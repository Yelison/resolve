import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { ticket } from '../../test/ticketFixtures'
import { TicketDetailPage } from './TicketDetailPage'

const messages = [
  {
    id: 'm-1',
    body: 'Ya te envié un nuevo enlace.',
    visibility: 'public',
    author: { id: 'u-laura', name: 'Laura Méndez', kind: 'agent' },
    createdAt: '2026-10-04T15:12:00Z',
  },
  {
    id: 'm-2',
    body: 'Verificación completada.',
    visibility: 'internal',
    author: { id: 'u-laura', name: 'Laura Méndez', kind: 'agent' },
    createdAt: '2026-10-04T15:13:00Z',
  },
]

const assignees = [
  { id: 'u-daniel', name: 'Daniel Santos', email: 'daniel@acme.example' },
  { id: 'u-laura', name: 'Laura Méndez', email: 'laura@acme.example' },
]

const activity = [
  {
    id: 'a-1',
    type: 'status_changed',
    actor: { id: 'u-laura', name: 'Laura Méndez' },
    from: 'open',
    to: 'in_progress',
    createdAt: '2026-10-04T15:14:00Z',
  },
]

function renderDetail(number = 1048) {
  const router = createMemoryRouter([{ path: '/tickets/:number', element: <TicketDetailPage /> }], {
    initialEntries: [`/tickets/${number}`],
  })
  renderWithProviders(<RouterProvider router={router} />)
}

const staffApi = (overrides = {}) =>
  mockApi({
    'GET /api/me': { body: adminMe },
    'GET /api/tickets/1048': { body: ticket() },
    'GET /api/tickets/1048/messages': { body: messages },
    'GET /api/tickets/1048/activity': { body: activity },
    'GET /api/assignees': { body: assignees },
    ...overrides,
  })

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('TicketDetailPage para agentes', () => {
  it('muestra el ticket, la descripción, la conversación con notas y los campos editables', async () => {
    staffApi()
    renderDetail()
    expect(await screen.findByRole('heading', { level: 1, name: 'No puedo acceder a mi cuenta' })).toBeInTheDocument()
    expect(screen.getByText('El enlace de recuperación dice que ya venció.')).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: 'Laura Méndez · Nota interna' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveValue('open')
    await userEvent.click(screen.getByRole('tab', { name: 'Historial' }))
    expect(await screen.findByText('Laura Méndez cambió el estado a En progreso')).toBeInTheDocument()
  })

  it('cambia el estado con la versión leída como If-Match', async () => {
    const fetchSpy = staffApi({ 'PATCH /api/tickets/1048': { body: ticket({ status: 'waiting', version: 4 }) } })
    renderDetail()
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Estado' }), 'waiting')
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Estado: Esperando cliente')).toBeInTheDocument()
    const patch = fetchSpy.mock.calls.map(([input]) => input as Request).find((request) => request.method === 'PATCH')!
    expect(patch.headers.get('If-Match')).toBe('"3"')
    expect(await patch.clone().json()).toEqual({ status: 'waiting' })
  })

  it('avisa del conflicto y recarga el ticket cuando otra persona lo cambió', async () => {
    let reads = 0
    staffApi({
      'GET /api/tickets/1048': () => {
        reads += 1
        return { body: ticket(reads === 1 ? {} : { priority: 'low', version: 4 }) }
      },
      'PATCH /api/tickets/1048': { status: 412, body: { status: 412, title: 'El recurso cambió' } },
    })
    renderDetail()
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Prioridad' }), 'high')
    expect(await screen.findByText('El ticket cambió mientras lo editabas')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Prioridad' })).toHaveValue('low'))
  })

  it('envía una respuesta pública y vacía el borrador', async () => {
    const fetchSpy = staffApi({
      'POST /api/tickets/1048/messages': {
        status: 201,
        body: { ...messages[0], id: 'm-3', body: '¿Pudiste acceder?' },
      },
    })
    renderDetail()
    const textarea = await screen.findByRole('textbox', { name: 'Respuesta al cliente' })
    await userEvent.type(textarea, '¿Pudiste acceder?')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }))
    await waitFor(() => expect(textarea).toHaveValue(''))
    const post = fetchSpy.mock.calls.map(([input]) => input as Request).find((request) => request.method === 'POST')!
    expect(await post.clone().json()).toEqual({ body: '¿Pudiste acceder?', visibility: 'public' })
  })

  it('explica que el ticket no existe', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/tickets/9999': { status: 404, body: { status: 404, title: 'No encontrado' } },
    })
    renderDetail(9999)
    expect(await screen.findByRole('heading', { name: 'No existe el ticket #9999' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a tickets' })).toHaveAttribute('href', '/tickets')
  })
})

describe('TicketDetailPage para clientes', () => {
  it('es de solo lectura, sin historial ni redactor', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: customerMe },
      'GET /api/tickets/1048': { body: ticket() },
      'GET /api/tickets/1048/messages': { body: [messages[0]] },
    })
    renderDetail()
    expect(await screen.findByRole('article', { name: 'Laura Méndez · Agente' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Historial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resolver ticket' })).not.toBeInTheDocument()
    const paths = fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url).pathname)
    expect(paths).not.toContain('/api/tickets/1048/activity')
    expect(paths).not.toContain('/api/assignees')
  })
})
