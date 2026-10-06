import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inOrder, lockTimeoutRoute, retryAfterLockTimeout, type SentRequest } from '../../lib/lockTimeoutTesting'
import { adminMe, mockApi, type MockRoute } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { customerKeys } from '../customers/queries'
import { memberKeys } from '../team/queries'
import { reportKeys } from '../reports/queries'
import { sessionKeys } from '../session/queries'
import { ticketKeys } from '../tickets/queries'
import { OrganizationTab } from './OrganizationTab'
import { organizationKeys } from './queries'
import { etag, organizationSettings } from './settingsFixtures'

const agentMe = { ...adminMe, role: 'agent' }
const problem = (status: number, extra: object = {}): MockRoute => ({
  status,
  body: { status, title: 'Error', ...extra },
})
const fieldProblem = (field: string, message: string) => problem(400, { errors: [{ field, message }] })

const requests = (fetchSpy: ReturnType<typeof mockApi>, method: string) =>
  fetchSpy.mock.calls.map(([input]) => input as Request).filter((request) => request.method === method)

function render(routes: Record<string, MockRoute | ((request: Request) => MockRoute | Promise<MockRoute>)> = {}) {
  const fetchSpy = mockApi({
    'GET /api/me': { body: adminMe },
    'GET /api/organization': { body: organizationSettings(), headers: etag(3) },
    ...routes,
  })
  const { queryClient } = renderWithProviders(<OrganizationTab />)
  return { fetchSpy, queryClient }
}

const field = (name: string) => screen.findByRole(name === 'Zona horaria' ? 'combobox' : 'textbox', { name })
const save = () => screen.getByRole('button', { name: 'Guardar cambios' })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OrganizationTab', () => {
  it('muestra un esqueleto con descripción mientras llegan los ajustes', async () => {
    render({ 'GET /api/organization': () => new Promise(() => {}) as never })
    expect(await screen.findByText('Cargando los ajustes de la empresa…')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('muestra los valores actuales, con la zona agrupada por región', async () => {
    render()
    expect(await field('Nombre del espacio')).toHaveValue('Acme Studio')
    expect(await field('Correo de soporte')).toHaveValue('soporte@acme.example')
    expect(await field('Zona horaria')).toHaveValue('America/Bogota')
    expect(await field('Objetivo de primera respuesta')).toHaveValue('30')
    expect(screen.getByRole('group', { name: 'América' })).toBeInTheDocument()
  })

  it('«Guardar cambios» está deshabilitado sin cambios y un envío con Enter no manda nada', async () => {
    const { fetchSpy } = render()
    await userEvent.type(await field('Nombre del espacio'), '{Enter}')
    expect(save()).toBeDisabled()
    expect(requests(fetchSpy, 'PATCH')).toHaveLength(0)
  })

  it('un cambio solo de espacios no cuenta como cambio', async () => {
    render()
    await userEvent.type(await field('Nombre del espacio'), '   ')
    expect(save()).toBeDisabled()
  })

  it('envía solo los campos cambiados con If-Match y merge-patch', async () => {
    const { fetchSpy } = render({
      'PATCH /api/organization': {
        body: organizationSettings({ name: 'Acme Studio SL', version: 4 }),
        headers: etag(4),
      },
    })
    const name = await field('Nombre del espacio')
    await userEvent.clear(name)
    await userEvent.type(name, '  Acme Studio SL ')
    await userEvent.click(save())
    await waitFor(() => expect(requests(fetchSpy, 'PATCH')).toHaveLength(1))
    const patch = requests(fetchSpy, 'PATCH')[0]!
    expect(patch.headers.get('If-Match')).toBe('"3"')
    expect(patch.headers.get('Content-Type')).toBe('application/merge-patch+json')
    expect(await patch.clone().json()).toEqual({ name: 'Acme Studio SL' })
  })

  it('vaciar el correo de soporte envía null', async () => {
    const { fetchSpy } = render({
      'PATCH /api/organization': { body: organizationSettings({ supportEmail: null, version: 4 }), headers: etag(4) },
    })
    await userEvent.clear(await field('Correo de soporte'))
    await userEvent.click(save())
    await waitFor(() => expect(requests(fetchSpy, 'PATCH')).toHaveLength(1))
    expect(await requests(fetchSpy, 'PATCH')[0]!.clone().json()).toEqual({ supportEmail: null })
  })

  it('cambia la zona y el objetivo como número', async () => {
    const { fetchSpy } = render({
      'PATCH /api/organization': {
        body: organizationSettings({ timeZone: 'Europe/Madrid', firstResponseTargetMinutes: 45, version: 4 }),
        headers: etag(4),
      },
    })
    await userEvent.selectOptions(await field('Zona horaria'), 'Europe/Madrid')
    const target = await field('Objetivo de primera respuesta')
    await userEvent.clear(target)
    await userEvent.type(target, '45')
    await userEvent.click(save())
    await waitFor(() => expect(requests(fetchSpy, 'PATCH')).toHaveLength(1))
    expect(await requests(fetchSpy, 'PATCH')[0]!.clone().json()).toEqual({
      timeZone: 'Europe/Madrid',
      firstResponseTargetMinutes: 45,
    })
  })

  it('valida antes de enviar, asocia el error al campo y enfoca el primero', async () => {
    const { fetchSpy } = render()
    const name = await field('Nombre del espacio')
    await userEvent.clear(name)
    const target = await field('Objetivo de primera respuesta')
    await userEvent.clear(target)
    await userEvent.type(target, '1441')
    await userEvent.click(save())
    expect(screen.getByText('Escribe el nombre del espacio.')).toBeInTheDocument()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription(/Escribe el nombre del espacio/)
    expect(name).toHaveFocus()
    expect(target).toHaveAccessibleDescription(/entre 1 y 1440/)
    expect(requests(fetchSpy, 'PATCH')).toHaveLength(0)
  })

  it('rechaza un objetivo que no es un entero y un correo mal escrito', async () => {
    render()
    const target = await field('Objetivo de primera respuesta')
    await userEvent.clear(target)
    await userEvent.type(target, '2,5')
    const email = await field('Correo de soporte')
    await userEvent.clear(email)
    await userEvent.type(email, 'sin-arroba')
    await userEvent.click(save())
    expect(target).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAttribute('aria-invalid', 'true')
  })

  it('muestra en el campo el error de una zona que el servidor no acepta', async () => {
    render({ 'PATCH /api/organization': fieldProblem('timeZone', 'Zona horaria no reconocida.') })
    const zone = await field('Zona horaria')
    await userEvent.selectOptions(zone, 'Europe/Madrid')
    await userEvent.click(save())
    expect(await screen.findByText('Zona horaria no reconocida.')).toBeInTheDocument()
    expect(zone).toHaveAttribute('aria-invalid', 'true')
    expect(zone).toHaveFocus()
    expect(zone).toHaveAccessibleDescription(/Zona horaria no reconocida/)
  })

  it('tras un 412 conserva lo escrito, carga la versión nueva y nombra lo que cambió', async () => {
    let version = 3
    const { fetchSpy } = render({
      'GET /api/organization': () => ({
        body: organizationSettings(
          version === 3 ? {} : { supportEmail: 'nuevo@acme.example', firstResponseTargetMinutes: 20, version },
        ),
        headers: etag(version),
      }),
      'PATCH /api/organization': () => {
        if (version === 3) {
          version = 4
          return problem(412)
        }
        return { body: organizationSettings({ name: 'Acme Studio SL', version: 5 }), headers: etag(5) }
      },
    })
    const name = await field('Nombre del espacio')
    await userEvent.clear(name)
    await userEvent.type(name, 'Acme Studio SL')
    await userEvent.click(save())
    expect(await screen.findByText('Los ajustes cambiaron mientras los editabas')).toBeInTheDocument()
    expect(await screen.findByText(/Cambió: Correo de soporte, Objetivo de primera respuesta/)).toBeInTheDocument()
    expect(name).toHaveValue('Acme Studio SL')
    expect(await field('Correo de soporte')).toHaveValue('nuevo@acme.example')
    await userEvent.click(save())
    await waitFor(() => expect(requests(fetchSpy, 'PATCH')).toHaveLength(2))
    const retry = requests(fetchSpy, 'PATCH')[1]!
    expect(retry.headers.get('If-Match')).toBe('"4"')
    // Los campos que tocó otra persona y que esta no editó no viajan: no se pisan.
    expect(await retry.clone().json()).toEqual({ name: 'Acme Studio SL' })
  })

  it('al guardar actualiza ajustes y sesión, invalida lo que depende de la zona y del objetivo y enfoca el título', async () => {
    const { queryClient } = render({
      'PATCH /api/organization': {
        body: organizationSettings({ name: 'Acme Studio SL', timeZone: 'Europe/Madrid', version: 4 }),
        headers: etag(4),
      },
    })
    queryClient.setQueryData(sessionKeys.me, adminMe)
    for (const key of [reportKeys.all, ticketKeys.metrics(), memberKeys.metrics(), customerKeys.metrics()]) {
      queryClient.setQueryData([...key, 'seed'], {})
    }
    const name = await field('Nombre del espacio')
    await userEvent.clear(name)
    await userEvent.type(name, 'Acme Studio SL')
    await userEvent.click(save())
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
    expect(queryClient.getQueryData<{ version: number }>(organizationKeys.settings())?.version).toBe(4)
    expect(queryClient.getQueryData<typeof adminMe>(sessionKeys.me)?.organization).toMatchObject({
      name: 'Acme Studio SL',
      timeZone: 'Europe/Madrid',
    })
    for (const key of [reportKeys.all, ticketKeys.metrics(), memberKeys.metrics(), customerKeys.metrics()]) {
      expect(queryClient.getQueryState([...key, 'seed'])?.isInvalidated, key.join('/')).toBe(true)
    }
    expect(save()).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'Empresa' })).toHaveFocus()
  })

  it('ignora un segundo envío mientras hay uno en curso y marca el formulario como ocupado', async () => {
    const { fetchSpy } = render({ 'PATCH /api/organization': () => new Promise(() => {}) as never })
    const name = await field('Nombre del espacio')
    await userEvent.type(name, ' SL')
    await userEvent.click(save())
    expect(await screen.findByRole('button', { name: 'Guardando…' })).toHaveAttribute('aria-busy', 'true')
    await userEvent.type(name, '{Enter}')
    expect(requests(fetchSpy, 'PATCH')).toHaveLength(1)
    expect(name.closest('form')).toHaveAttribute('aria-busy', 'true')
  })

  it('un fallo del servidor no pierde lo escrito y se anuncia', async () => {
    render({ 'PATCH /api/organization': problem(500) })
    const name = await field('Nombre del espacio')
    await userEvent.type(name, ' SL')
    await userEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron guardar los ajustes de la empresa')
    expect(name).toHaveValue('Acme Studio SL')
    expect(save()).toBeEnabled()
  })

  it('un 403 relee la sesión y explica la negativa', async () => {
    const { fetchSpy } = render({
      'PATCH /api/organization': problem(403, { detail: 'Solo un administrador puede cambiar los ajustes.' }),
    })
    const meRequests = () => requests(fetchSpy, 'GET').filter((request) => new URL(request.url).pathname === '/api/me')
    await userEvent.type(await field('Nombre del espacio'), ' SL')
    const before = meRequests().length
    await userEvent.click(save())
    expect(await screen.findByText('Solo un administrador puede cambiar los ajustes.')).toBeInTheDocument()
    await waitFor(() => expect(meRequests().length).toBeGreaterThan(before))
  })

  it('si falla la carga ofrece reintentar y carga al reintentar', async () => {
    let fail = true
    render({
      'GET /api/organization': () => (fail ? problem(500) : { body: organizationSettings(), headers: etag(3) }),
    })
    expect(await screen.findByText('No pudimos cargar los ajustes de la empresa')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar los ajustes' }))
    expect(await field('Nombre del espacio')).toHaveValue('Acme Studio')
  })

  it('un nombre de 120 caracteres cabe sin recortes en el campo y se acepta', async () => {
    const long = 'N'.repeat(120)
    const { fetchSpy } = render({
      'PATCH /api/organization': { body: organizationSettings({ name: long, version: 4 }), headers: etag(4) },
    })
    const name = await field('Nombre del espacio')
    await userEvent.clear(name)
    await userEvent.click(name)
    await userEvent.paste(long + 'extra')
    expect(name).toHaveValue(long)
    await userEvent.click(save())
    await waitFor(() => expect(requests(fetchSpy, 'PATCH')).toHaveLength(1))
  })

  describe('como agente', () => {
    it('ve los ajustes en lectura, sin campos ni botón de guardar', async () => {
      const { fetchSpy } = render({ 'GET /api/me': { body: agentMe } })
      const facts = (await screen.findByText('Acme Studio')).closest('dl')!
      expect(within(facts).getByText('Acme Studio')).toBeInTheDocument()
      expect(within(facts).getByText('30 min')).toBeInTheDocument()
      expect(within(facts).getByText('America/Bogota')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
      expect(requests(fetchSpy, 'PATCH')).toHaveLength(0)
    })

    it('dice que no hay correo de soporte cuando no está configurado', async () => {
      render({
        'GET /api/me': { body: agentMe },
        'GET /api/organization': { body: organizationSettings({ supportEmail: null }), headers: etag(3) },
      })
      expect(await screen.findByText('Sin configurar')).toBeInTheDocument()
    })
  })
})

describe('OrganizationTab con un 503 de bloqueo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Los ajustes tienen la versión 3 y, tras la primera escritura fallida, otra persona guarda la 4. */
  async function renameWith(user: ReturnType<typeof userEvent.setup>, seen: SentRequest[], ...replies: MockRoute[]) {
    let version = 3
    const patch = inOrder(seen, ...replies)
    render({
      'GET /api/organization': () => ({
        body: organizationSettings(version === 3 ? {} : { supportEmail: 'nuevo@acme.example', version }),
        headers: etag(version),
      }),
      'PATCH /api/organization': async (request) => {
        const reply = await patch(request)
        if (reply.status === 503) version = 4
        return reply
      },
    })
    const name = await field('Nombre del espacio')
    await user.clear(name)
    await user.type(name, 'Acme Studio SL')
    await user.click(save())
    return name
  }

  it('conserva lo escrito, ofrece «Reintentar» y repite el PATCH con el mismo cuerpo y la misma versión', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const seen: SentRequest[] = []
    const name = await renameWith(user, seen, lockTimeoutRoute(), {
      body: organizationSettings({ name: 'Acme Studio SL', version: 5 }),
      headers: etag(5),
    })
    expect(
      await screen.findByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('No se pudieron guardar los ajustes de la empresa')).not.toBeInTheDocument()
    expect(name).toHaveValue('Acme Studio SL')

    await retryAfterLockTimeout(user, 'Reintentar guardar los ajustes de la empresa')
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
    expect(
      screen.queryByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).not.toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    expect(seen[0]).toEqual({ body: JSON.stringify({ name: 'Acme Studio SL' }), ifMatch: '"3"' })
  })

  it('si otra persona guardó entretanto, el reintento lleva la versión original y recibe el 412 de siempre', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const seen: SentRequest[] = []
    const name = await renameWith(user, seen, lockTimeoutRoute(), problem(412))
    await screen.findByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.')
    // La versión 4 llega por la recarga que hace la mutación; el reintento no la usa.
    expect(await field('Correo de soporte')).toHaveValue('nuevo@acme.example')
    await retryAfterLockTimeout(user, 'Reintentar guardar los ajustes de la empresa')

    expect(await screen.findByText('Los ajustes cambiaron mientras los editabas')).toBeInTheDocument()
    expect(
      screen.queryByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).not.toBeInTheDocument()
    expect(name).toHaveValue('Acme Studio SL')
    expect(seen.map((request) => request.ifMatch)).toEqual(['"3"', '"3"'])
  })
})
