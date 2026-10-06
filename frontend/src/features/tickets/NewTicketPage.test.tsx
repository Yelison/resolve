import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireRole } from '../../app/pages/RequireRole'
import { inOrder, lockTimeoutRoute, retryAfterLockTimeout, type SentRequest } from '../../lib/lockTimeoutTesting'
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

  describe('un 503 de bloqueo', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    async function fillAndSend(
      user: ReturnType<typeof userEvent.setup>,
      seen: SentRequest[],
      ...replies: Parameters<typeof inOrder>[1][]
    ) {
      mockApi({
        'GET /api/me': { body: adminMe },
        'GET /api/customers': { body: customers },
        'GET /api/assignees': { body: assignees },
        'POST /api/tickets': inOrder(seen, ...replies),
      })
      const router = renderForm()
      await user.click(await screen.findByRole('combobox', { name: 'Cliente' }))
      await user.click(await screen.findByRole('option', { name: /María Pérez/ }))
      await user.type(screen.getByRole('textbox', { name: 'Asunto' }), 'No llega el correo')
      await user.type(screen.getByRole('textbox', { name: 'Descripción' }), 'Desde ayer no recibo avisos.')
      await user.click(screen.getByRole('button', { name: 'Crear ticket' }))
      return router
    }

    it('conserva lo escrito, ofrece «Reintentar» y repite la misma petición', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const seen: SentRequest[] = []
      const router = await fillAndSend(user, seen, lockTimeoutRoute(), { status: 201, body: ticket({ number: 1049 }) })

      expect(
        await screen.findByText('Otra persona está guardando este recurso; vuelve a intentarlo.'),
      ).toBeInTheDocument()
      expect(screen.queryByText('No se pudo crear el ticket')).not.toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Asunto' })).toHaveValue('No llega el correo')
      expect(screen.getByRole('textbox', { name: 'Descripción' })).toHaveValue('Desde ayer no recibo avisos.')
      expect(seen).toHaveLength(1)

      await retryAfterLockTimeout(user, 'Reintentar crear el ticket')
      expect(await screen.findByText('Detalle')).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/tickets/1049')
      expect(seen).toHaveLength(2)
      expect(seen[1]).toEqual(seen[0])
    })

    it('si el reintento falla por validación, muestra el error del campo de siempre', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const seen: SentRequest[] = []
      await fillAndSend(user, seen, lockTimeoutRoute(), {
        status: 400,
        body: {
          status: 400,
          title: 'Datos no válidos',
          errors: [{ field: 'subject', message: 'Ese asunto ya existe.' }],
        },
      })
      await retryAfterLockTimeout(user, 'Reintentar crear el ticket')
      expect(await screen.findByRole('textbox', { name: 'Asunto' })).toHaveAccessibleDescription(
        'Ese asunto ya existe.',
      )
      expect(
        screen.queryByText('Otra persona está guardando este recurso; vuelve a intentarlo.'),
      ).not.toBeInTheDocument()
    })

    describe('rechazos de la demostración pública', () => {
      async function expectKeptAndAnnounced(title: string, message?: string) {
        const alert = await screen.findByRole('status')
        expect(within(alert).getByText(title)).toBeInTheDocument()
        if (message) expect(within(alert).getByText(message)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
        expect(screen.queryByText('Revisa tu conexión e inténtalo de nuevo.')).not.toBeInTheDocument()
        // El rechazo de la demostración no va además a un aviso genérico («Inténtalo de nuevo.»).
        const toasts = screen.queryByRole('region', { name: 'Notificaciones' })
        if (toasts) expect(toasts).not.toHaveTextContent('Inténtalo de nuevo.')
        expect(screen.getByRole('textbox', { name: 'Asunto' })).toHaveValue('No llega el correo')
        expect(screen.getByRole('textbox', { name: 'Descripción' })).toHaveValue('Desde ayer no recibo avisos.')
      }

      it('el 503 del reinicio avisa sin «Reintentar» local y conserva lo escrito', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        await fillAndSend(user, [], {
          status: 503,
          headers: { 'Retry-After': '60' },
          body: { status: 503, title: 'Reinicio de la demostración en curso', detail: 'Vuelve en unos minutos.' },
        })
        await expectKeptAndAnnounced('No se pudo crear el ticket; lo que escribiste sigue aquí.')
        // El texto del reinicio es del aviso global del shell: aquí no se repite.
        expect(screen.queryByText(/Estamos reiniciando/)).not.toBeInTheDocument()
        expect(
          screen.queryByText('Otra persona está guardando este recurso; vuelve a intentarlo.'),
        ).not.toBeInTheDocument()
      })

      it('el 429 pide esperar, no reintenta solo y conserva lo escrito', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        const seen: SentRequest[] = []
        await fillAndSend(user, seen, {
          status: 429,
          headers: { 'Retry-After': '30' },
          body: { status: 429, title: 'Demasiadas escrituras', detail: 'Más de 60 escrituras en un minuto.' },
        })
        await expectKeptAndAnnounced(
          'No se pudo crear el ticket',
          'Has hecho muchos cambios seguidos; espera un momento.',
        )
        await act(() => vi.advanceTimersByTimeAsync(60_000))
        expect(seen).toHaveLength(1)
      })

      it('el 409 del tope muestra el detail del Problem y conserva lo escrito', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        await fillAndSend(user, [], {
          status: 409,
          body: {
            status: 409,
            title: 'Límite de la demostración',
            detail: 'La demostración admite hasta 500 tickets por organización.',
          },
        })
        await expectKeptAndAnnounced(
          'No se pudo crear el ticket',
          'La demostración admite hasta 500 tickets por organización.',
        )
      })
    })

    it('editar el formulario retira el aviso: el reintento repetiría lo enviado, no lo que se ve', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await fillAndSend(user, [], lockTimeoutRoute())
      await screen.findByRole('button', { name: 'Reintentar crear el ticket' })
      await user.type(screen.getByRole('textbox', { name: 'Asunto' }), '!')
      expect(screen.queryByRole('button', { name: 'Reintentar crear el ticket' })).not.toBeInTheDocument()
    })
  })
})
