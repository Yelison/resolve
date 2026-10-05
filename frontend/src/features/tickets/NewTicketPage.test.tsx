import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequireRole } from '../../app/pages/RequireRole'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { ticket } from '../../test/ticketFixtures'
import { NewTicketPage } from './NewTicketPage'

const customers = {
  items: [{ id: 'c-maria', name: 'María Pérez', email: 'maria@cliente.example', company: 'Acme Studio' }],
  page: 0,
  size: 20,
  totalItems: 1,
  totalPages: 1,
}
const assignees = [{ id: 'u-laura', name: 'Laura Méndez', email: 'laura@acme.example' }]

function renderForm() {
  const router = createMemoryRouter(
    [
      {
        path: '/tickets/nuevo',
        element: (
          <RequireRole roles={['admin', 'agent']}>
            <NewTicketPage />
          </RequireRole>
        ),
      },
      { path: '/tickets/:number', element: <p>Detalle</p> },
      { path: '/tickets', element: <p>Bandeja</p> },
    ],
    { initialEntries: ['/tickets/nuevo'] },
  )
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NewTicketPage', () => {
  it('valida los campos obligatorios y lleva el foco al primero', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/customers': { body: customers },
      'GET /api/assignees': { body: assignees },
    })
    renderForm()
    await userEvent.click(await screen.findByRole('button', { name: 'Crear ticket' }))
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveFocus()
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveAccessibleDescription('Selecciona un cliente.')
    expect(screen.getByRole('textbox', { name: 'Asunto' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: 'Descripción' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('crea el ticket con el cliente elegido y abre su detalle', async () => {
    const fetchSpy = mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/customers': { body: customers },
      'GET /api/assignees': { body: assignees },
      'POST /api/tickets': { status: 201, body: ticket({ number: 1049 }) },
    })
    const router = renderForm()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Cliente' }))
    await userEvent.click(await screen.findByRole('option', { name: /María Pérez/ }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Asunto' }), 'No llega el correo')
    await userEvent.type(screen.getByRole('textbox', { name: 'Descripción' }), 'Desde ayer no recibo avisos.')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Prioridad' }), 'high')
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Responsable' }), 'u-laura')
    await userEvent.click(screen.getByRole('button', { name: 'Crear ticket' }))

    expect(await screen.findByText('Detalle')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets/1049')
    const post = fetchSpy.mock.calls.map(([input]) => input as Request).find((request) => request.method === 'POST')!
    expect(await post.clone().json()).toEqual({
      customerId: 'c-maria',
      subject: 'No llega el correo',
      description: 'Desde ayer no recibo avisos.',
      priority: 'high',
      assigneeId: 'u-laura',
    })
  })

  it('muestra junto a cada campo los errores que devuelve la API', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'GET /api/customers': { body: customers },
      'GET /api/assignees': { body: assignees },
      'POST /api/tickets': {
        status: 400,
        body: {
          status: 400,
          title: 'Petición no válida',
          errors: [{ field: 'customerId', message: 'Selecciona un cliente de tu organización.' }],
        },
      },
    })
    renderForm()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Cliente' }))
    await userEvent.click(await screen.findByRole('option', { name: /María Pérez/ }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Asunto' }), 'Asunto')
    await userEvent.type(screen.getByRole('textbox', { name: 'Descripción' }), 'Descripción')
    await userEvent.click(screen.getByRole('button', { name: 'Crear ticket' }))
    expect(await screen.findByText('Selecciona un cliente de tu organización.')).toBeInTheDocument()
  })

  it('no está disponible para clientes', async () => {
    mockApi({ 'GET /api/me': { body: customerMe } })
    renderForm()
    expect(await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear ticket' })).not.toBeInTheDocument()
  })
})
