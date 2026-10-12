import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me, OrganizationRef } from '../../api/schema'
import { adminMe, mockApi } from '../../test/api'
import { metrics } from '../../test/ticketFixtures'
import { ticketKeys } from '../tickets/queries'
import { sessionKeys } from './queries'
import { releaseWrites } from './sessionLifecycle'
import { renderShell, setCsrfCookie } from './shellHarness'
import { orgA, orgB } from './workspaceFixtures'

const LIMIT_URL = 'https://resolve.example/problems/organization-limit'

const inOrg = (org: OrganizationRef, all: OrganizationRef[], creation: Me['organizationCreation']) =>
  ({
    ...adminMe,
    role: org.role,
    organization: { ...adminMe.organization, id: org.id, name: org.name },
    organizations: all,
    organizationCreation: creation,
  }) as Me

const meInAcme = inOrg(orgA, [orgA, orgB], { allowed: true, created: 1, limit: 3 })

const newWorkspace: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000009',
  name: 'Lumen Diseño',
  role: 'admin',
  color: 'orange',
  memberCount: 1,
}
const meInNew = {
  ...meInAcme,
  organization: { ...adminMe.organization, id: newWorkspace.id, name: newWorkspace.name, timeZone: 'Europe/Madrid' },
  organizations: [orgA, orgB, newWorkspace],
  organizationCreation: { allowed: true, created: 2, limit: 3 },
} as Me

const card = () => screen.findByRole('button', { name: 'Espacio: Acme Studio. Cambiar de espacio' })

async function openDialog() {
  await userEvent.click(await card())
  await userEvent.click(screen.getByRole('menuitem', { name: 'Crear espacio' }))
  return screen.findByRole('dialog', { name: 'Crear espacio' })
}

const problem = (status: number, extra: object = {}) => ({ status, body: { status, title: 'Problema', ...extra } })
const requests = (spy: ReturnType<typeof mockApi>) => spy.mock.calls.map(([input]) => input as Request)
const posts = (spy: ReturnType<typeof mockApi>) =>
  requests(spy).filter((request) => request.method === 'POST' && request.url.endsWith('/api/organizations'))

beforeEach(() => {
  sessionStorage.clear()
  setCsrfCookie('token-1')
})

afterEach(() => {
  releaseWrites()
  vi.restoreAllMocks()
  sessionStorage.clear()
  setCsrfCookie(null)
})

describe('diálogo «Crear espacio»', () => {
  it('pide el nombre y la zona horaria, con la del navegador por defecto, y no cambia nada al abrirlo', async () => {
    const spy = mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell()
    const dialog = await openDialog()
    expect(within(dialog).getByText(/Serás su administrador/)).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: 'Nombre del espacio' })).toHaveValue('')
    const zone = within(dialog).getByRole('combobox', { name: 'Zona horaria' }) as HTMLSelectElement
    expect(zone.value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(posts(spy)).toHaveLength(0)
  })

  it('sin nombre muestra el error bajo el campo, lo anuncia y no envía nada', async () => {
    const spy = mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell()
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear espacio' }))
    const field = within(dialog).getByRole('textbox', { name: 'Nombre del espacio' })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveFocus()
    const error = within(dialog).getByRole('alert')
    expect(error).toHaveTextContent('Escribe un nombre para el espacio.')
    expect(field.getAttribute('aria-describedby')).toContain(error.id)
    expect(posts(spy)).toHaveLength(0)
    // Escribir lo retira.
    await userEvent.type(field, 'L')
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un nombre de solo espacios cuenta como vacío', async () => {
    const spy = mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell()
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nombre del espacio' }), '   ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear espacio' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Escribe un nombre para el espacio.')
    expect(posts(spy)).toHaveLength(0)
  })

  it('un `400` del servidor sobre un campo va bajo ese campo, anunciado, con el foco en él', async () => {
    mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/organizations': problem(400, {
        errors: [{ field: 'timeZone', message: 'Zona horaria no reconocida por el servidor.' }],
      }),
    })
    renderShell()
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nombre del espacio' }), 'Lumen Diseño')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear espacio' }))
    const zone = await within(dialog).findByRole('combobox', { name: 'Zona horaria' })
    expect(zone).toHaveAttribute('aria-invalid', 'true')
    expect(zone).toHaveFocus()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Zona horaria no reconocida por el servidor.')
    // El diálogo sigue abierto y se puede corregir.
    expect(screen.getByRole('dialog', { name: 'Crear espacio' })).toBeInTheDocument()
  })

  it('crea: envía el nombre recortado y la zona, entra en el espacio nuevo, vacía la caché y avisa; el foco no queda en body', async () => {
    const spy = mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/organizations': { status: 201, body: meInNew },
      'GET /api/tickets/metrics': { body: { ...metrics, gettingStarted: null } },
    })
    sessionStorage.setItem('resolve-draft-1046', 'Borrador del otro espacio')
    const { queryClient, router } = renderShell('/tickets/1046')
    queryClient.setQueryData(['tickets', 'detail', 1046], { subject: 'Ticket de Acme' })
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nombre del espacio' }), '  Lumen Diseño  ')
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Zona horaria' }), 'Europe/Madrid')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear espacio' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    const post = posts(spy)[0]!
    expect(post.headers.get('X-XSRF-TOKEN')).toBe('token-1')
    // Elegir la organización y crear una no llevan `X-Organization-Id`: es lo que la cambia.
    expect(post.headers.get('X-Organization-Id')).toBeNull()
    await expect(post.clone().json()).resolves.toEqual({ name: 'Lumen Diseño', timeZone: 'Europe/Madrid' })
    expect(queryClient.getQueryData(['tickets', 'detail', 1046])).toBeUndefined()
    expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
    expect(queryClient.getQueryData(sessionKeys.me)).toEqual(meInNew)
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Ya estás en Lumen Diseño')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crear espacio' })).not.toBeInTheDocument())
    // El foco va al contenido de la pantalla nueva, no a `body`.
    await waitFor(() => expect(document.getElementById('contenido')).toHaveFocus())
    // «Primeros pasos» sale de las métricas: ya están en caché cuando Inicio se pinta, sin que nada las pida desde la página.
    expect(queryClient.getQueryData(ticketKeys.metrics())).toEqual({ ...metrics, gettingStarted: null })
    expect(await screen.findByRole('button', { name: 'Espacio: Lumen Diseño. Cambiar de espacio' })).toBeInTheDocument()
  })

  it('si las métricas del espacio nuevo fallan, entra igual: Inicio las pide como siempre', async () => {
    mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/organizations': { status: 201, body: meInNew },
      'GET /api/tickets/metrics': { status: 500, body: { status: 500, title: 'Error' } },
    })
    const { queryClient, router } = renderShell('/tickets/1046')
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nombre del espacio' }), 'Lumen Diseño')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear espacio' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(queryClient.getQueryData(ticketKeys.metrics())).toBeUndefined()
    expect(queryClient.getQueryData(sessionKeys.me)).toEqual(meInNew)
  })

  it('al límite (`409` organization-limit) pasa al estado del límite con «Ver tus espacios» y «Cerrar»', async () => {
    mockApi({
      'GET /api/me': { body: { ...meInAcme, organizationCreation: { allowed: true, created: 2, limit: 3 } } },
      'POST /api/organizations': problem(409, { type: LIMIT_URL }),
    })
    renderShell()
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nombre del espacio' }), 'Otro')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear espacio' }))
    expect(await screen.findByText('Ya creaste 3 espacios, el máximo por persona.')).toBeInTheDocument()
    const limit = screen.getByRole('dialog', { name: 'Crear espacio' })
    expect(within(limit).getByText(/sal de uno que ya no uses/)).toBeInTheDocument()
    expect(within(limit).getByRole('button', { name: 'Ver tus espacios' })).toBeInTheDocument()
    expect(within(limit).queryByRole('textbox')).not.toBeInTheDocument()
    await userEvent.click(within(limit).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crear espacio' })).not.toBeInTheDocument())
    expect(await card()).toHaveFocus()
  })

  it('«Ver tus espacios» cierra el diálogo y lleva a Tus espacios', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    const { router, queryClient } = renderShell('/tickets')
    router.routes[0]!.children!.push({ path: 'configuracion/espacios', element: <h1>Tus espacios</h1> })
    await openDialog()
    act(() => {
      queryClient.setQueryData(sessionKeys.me, {
        ...meInAcme,
        organizationCreation: { allowed: false, created: 3, limit: 3 },
      })
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Ver tus espacios' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/configuracion/espacios'))
    expect(screen.queryByRole('dialog', { name: 'Crear espacio' })).not.toBeInTheDocument()
  })

  it('si `allowed` pasa a `false` con el diálogo abierto, cambia al estado del límite con el número del servidor', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    const { queryClient } = renderShell()
    await openDialog()
    act(() => {
      queryClient.setQueryData(sessionKeys.me, {
        ...meInAcme,
        organizationCreation: { allowed: false, created: 5, limit: 5 },
      })
    })
    expect(await screen.findByText('Ya creaste 5 espacios, el máximo por persona.')).toBeInTheDocument()
  })

  it('con 403 (ya no administras ningún espacio) no dice que llegaste al límite', async () => {
    mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/organizations': problem(403),
    })
    const { queryClient } = renderShell()
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nombre del espacio' }), 'Otro')
    mockApi({
      'GET /api/me': { body: { ...meInAcme, organizationCreation: { allowed: false, created: 1, limit: 3 } } },
      'POST /api/organizations': problem(403),
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear espacio' }))
    expect(await screen.findByText('Solo quien administra un espacio puede crear otros.')).toBeInTheDocument()
    expect(screen.queryByText(/Ya creaste/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver tus espacios' })).not.toBeInTheDocument()
    expect(queryClient.getQueryData<Me>(sessionKeys.me)?.organizationCreation.allowed).toBe(false)
  })

  it('Escape y «Cancelar» cierran sin crear y devuelven el foco a la tarjeta', async () => {
    const spy = mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell()
    const first = await openDialog()
    // jsdom no cierra un `<dialog>` con Escape: el navegador lo hace disparando `cancel`.
    fireEvent(first, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crear espacio' })).not.toBeInTheDocument())
    expect(await card()).toHaveFocus()
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crear espacio' })).not.toBeInTheDocument())
    expect(await card()).toHaveFocus()
    expect(posts(spy)).toHaveLength(0)
  })

  it('el botón queda en carga mientras se crea y un segundo envío no sale', async () => {
    let release: (value: { status: number; body: Me }) => void = () => {}
    const pending = new Promise<{ status: number; body: Me }>((resolve) => (release = resolve))
    const spy = mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/organizations': () => pending,
      'GET /api/tickets/metrics': { body: { ...metrics, gettingStarted: null } },
    })
    renderShell()
    const dialog = await openDialog()
    const name = within(dialog).getByRole('textbox', { name: 'Nombre del espacio' })
    await userEvent.type(name, 'Lumen Diseño{Enter}')
    await userEvent.type(name, '{Enter}')
    expect(within(dialog).getByRole('button', { name: 'Creando…' })).toBeInTheDocument()
    expect(posts(spy)).toHaveLength(1)
    await act(async () => release({ status: 201, body: meInNew }))
  })
})
