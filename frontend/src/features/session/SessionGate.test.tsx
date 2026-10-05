import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '../../app/layout/AppShell'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { ticket } from '../../test/ticketFixtures'
import { TicketDetailPage } from '../tickets/TicketDetailPage'
import { sessionRoutes } from './routes'

const personA = adminMe
const personB = { ...adminMe, user: { id: 'u-jordi', name: 'Jordi Puig', email: 'jordi@acme.example' } }
const otherOrganization = {
  ...adminMe,
  organization: { ...adminMe.organization, id: 'org-2', name: 'Northwind' },
}
const unauthorized = { status: 401, body: { status: 401, title: 'No autenticado' } }

/**
 * Una carga de la aplicación, con el `Me` indicado. Cada llamada es como recargar la pestaña: el árbol y la caché son
 * nuevos y solo sobrevive `sessionStorage`, que es lo que ocurre al pasar por el proveedor de identidad.
 */
function loadApp(me: typeof adminMe | null) {
  mockApi({
    'GET /api/me': me ? { body: me } : unauthorized,
    'GET /api/tickets/1048': { body: ticket() },
    'GET /api/tickets/1048/messages': { body: [] },
    'GET /api/tickets/1048/activity': { body: [] },
    'GET /api/assignees': { body: [] },
  })
  const router = createMemoryRouter(
    [
      { path: '/', element: <AppShell />, children: [{ path: 'tickets/:number', element: <TicketDetailPage /> }] },
      ...sessionRoutes,
    ],
    { initialEntries: ['/tickets/1048'] },
  )
  const rendered = renderWithProviders(<RouterProvider router={router} />)
  return { router, ...rendered }
}

const reply = () => screen.findByRole('textbox', { name: 'Respuesta al cliente' })

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('borradores de otra sesión (A-1)', () => {
  /** A escribe un borrador, la sesión se pierde y se pasa por /entrar; después entra `next`. */
  async function aThenSignInAs(next: typeof adminMe) {
    const first = loadApp(personA)
    await userEvent.type(await reply(), 'Borrador privado de A')
    expect(sessionStorage.getItem('resolve-draft-1048')).toBe('Borrador privado de A')
    first.unmount()

    const expired = loadApp(null)
    expect(await screen.findByRole('heading', { name: 'Entra a Resolve' })).toBeInTheDocument()
    expired.unmount()
    // El borrador sigue ahí mientras nadie ha entrado: es el que la misma persona recuperaría.
    expect(sessionStorage.getItem('resolve-draft-1048')).toBe('Borrador privado de A')

    return loadApp(next)
  }

  it('otra persona en la misma pestaña encuentra el redactor vacío', async () => {
    await aThenSignInAs(personB)
    expect(await reply()).toHaveValue('')
    expect(sessionStorage.getItem('resolve-draft-1048')).toBeNull()
  })

  it('otra organización con el mismo número de ticket encuentra el redactor vacío', async () => {
    await aThenSignInAs(otherOrganization)
    expect(await reply()).toHaveValue('')
    expect(sessionStorage.getItem('resolve-draft-1048')).toBeNull()
  })

  it('la misma persona en la misma organización recupera su borrador (foco 5)', async () => {
    await aThenSignInAs(personA)
    expect(await reply()).toHaveValue('Borrador privado de A')
  })

  it('el borrador que escribe quien entra después es suyo y sobrevive a otra caducidad', async () => {
    const signedIn = await aThenSignInAs(personB)
    await userEvent.type(await reply(), 'Borrador de B')
    signedIn.unmount()
    const again = loadApp(personB)
    expect(await reply()).toHaveValue('Borrador de B')
    again.unmount()
  })
})
