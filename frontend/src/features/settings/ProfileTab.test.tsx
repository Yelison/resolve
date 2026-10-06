import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inOrder, lockTimeoutRoute, retryAfterLockTimeout, type SentRequest } from '../../lib/lockTimeoutTesting'
import { adminMe, customerMe, mockApi, type MockRoute } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { memberKeys } from '../team/queries'
import { reportKeys } from '../reports/queries'
import { sessionKeys } from '../session/queries'
import { ticketKeys } from '../tickets/queries'
import { ProfileTab } from './ProfileTab'

const problem = (status: number, extra: object = {}): MockRoute => ({
  status,
  body: { status, title: 'Error', ...extra },
})
const patches = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls.map(([input]) => input as Request).filter((request) => request.method === 'PATCH')

function render(me: object = adminMe, routes: Record<string, MockRoute | (() => MockRoute)> = {}) {
  const fetchSpy = mockApi({ 'GET /api/me': { body: me }, ...routes })
  const { queryClient } = renderWithProviders(<ProfileTab />)
  return { fetchSpy, queryClient }
}

const name = () => screen.findByRole('textbox', { name: 'Nombre' })
const save = () => screen.getByRole('button', { name: 'Guardar cambios' })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProfileTab', () => {
  it('muestra un esqueleto mientras carga la sesión', async () => {
    mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderWithProviders(<ProfileTab />)
    expect(await screen.findByText('Cargando tu perfil…')).toBeInTheDocument()
  })

  it('muestra el nombre, el rol y el correo sin un campo para cambiarlo', async () => {
    render()
    expect(await name()).toHaveValue('Yelisson Ortiz')
    expect(screen.getByText('Administrador')).toBeInTheDocument()
    expect(screen.getByText('yelisson@acme.example')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(save()).toBeDisabled()
  })

  it('dice que el historial conserva el nombre de cada momento (personal)', async () => {
    render()
    await name()
    expect(
      screen.getByText(/El historial de actividad conserva el nombre que tenías en cada momento/),
    ).toBeInTheDocument()
  })

  it('a un cliente le explica que su ficha de cliente es independiente', async () => {
    render(customerMe)
    await name()
    expect(screen.getByText('Así te mostramos en tu cuenta.')).toBeInTheDocument()
    expect(screen.queryByText(/historial de actividad/)).not.toBeInTheDocument()
  })

  it('envía solo el nombre recortado, actualiza la sesión y relee lo que muestra tu nombre', async () => {
    const saved = { ...adminMe, user: { ...adminMe.user, name: 'Yelisson O. Ortiz' } }
    const { fetchSpy, queryClient } = render(adminMe, { 'PATCH /api/me': { body: saved } })
    for (const key of [memberKeys.all, ticketKeys.all, reportKeys.all]) queryClient.setQueryData([...key, 'seed'], {})
    const input = await name()
    await userEvent.clear(input)
    await userEvent.type(input, '  Yelisson O. Ortiz ')
    await userEvent.click(save())
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
    expect(await patches(fetchSpy)[0]!.clone().json()).toEqual({ name: 'Yelisson O. Ortiz' })
    expect(queryClient.getQueryData<typeof adminMe>(sessionKeys.me)?.user.name).toBe('Yelisson O. Ortiz')
    for (const key of [memberKeys.all, ticketKeys.all, reportKeys.all]) {
      expect(queryClient.getQueryState([...key, 'seed'])?.isInvalidated, key.join('/')).toBe(true)
    }
    expect(save()).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'Perfil' })).toHaveFocus()
  })

  it('funciona igual para un cliente', async () => {
    const { fetchSpy } = render(customerMe, {
      'PATCH /api/me': { body: { ...customerMe, user: { ...customerMe.user, name: 'María P.' } } },
    })
    const input = await name()
    await userEvent.clear(input)
    await userEvent.type(input, 'María P.')
    await userEvent.click(save())
    await waitFor(() => expect(patches(fetchSpy)).toHaveLength(1))
  })

  it('valida que haya nombre antes de enviar', async () => {
    const { fetchSpy } = render()
    const input = await name()
    await userEvent.clear(input)
    await userEvent.click(save())
    expect(screen.getByText('Escribe tu nombre.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/Escribe tu nombre/)
    expect(input).toHaveFocus()
    expect(patches(fetchSpy)).toHaveLength(0)
  })

  it('muestra en el campo el error que devuelve el servidor', async () => {
    render(adminMe, {
      'PATCH /api/me': problem(400, { errors: [{ field: 'name', message: 'No admite caracteres de control.' }] }),
    })
    const input = await name()
    await userEvent.type(input, ' x')
    await userEvent.click(save())
    expect(await screen.findByText('No admite caracteres de control.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('ignora un segundo envío mientras hay uno en curso', async () => {
    const { fetchSpy } = render(adminMe, { 'PATCH /api/me': () => new Promise(() => {}) as never })
    const input = await name()
    await userEvent.type(input, ' x')
    await userEvent.click(save())
    expect(await screen.findByRole('button', { name: 'Guardando…' })).toBeInTheDocument()
    await userEvent.type(input, '{Enter}')
    expect(patches(fetchSpy)).toHaveLength(1)
  })

  it('un fallo de red se anuncia y conserva lo escrito', async () => {
    render(adminMe, { 'PATCH /api/me': problem(500) })
    const input = await name()
    await userEvent.type(input, ' x')
    await userEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar tu nombre')
    expect(input).toHaveValue('Yelisson Ortiz x')
  })
})

describe('ProfileTab con un 503 de bloqueo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function rename(user: ReturnType<typeof userEvent.setup>, ...replies: Parameters<typeof inOrder>[1][]) {
    const seen: SentRequest[] = []
    mockApi({ 'GET /api/me': { body: adminMe }, 'PATCH /api/me': inOrder(seen, ...replies) })
    renderWithProviders(<ProfileTab />)
    const input = await name()
    await user.clear(input)
    await user.type(input, 'Yelisson O. Ortiz')
    await user.click(save())
    return { seen, input }
  }

  it('conserva el nombre, ofrece «Reintentar» y repite la misma petición', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { seen, input } = await rename(user, lockTimeoutRoute(), {
      body: { ...adminMe, user: { ...adminMe.user, name: 'Yelisson O. Ortiz' } },
    })
    expect(
      await screen.findByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('No se pudo guardar tu nombre')).not.toBeInTheDocument()
    expect(input).toHaveValue('Yelisson O. Ortiz')

    await retryAfterLockTimeout(user, 'Reintentar guardar tu nombre')
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
    expect(
      screen.queryByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).not.toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    expect(JSON.parse(seen[0]?.body ?? '')).toEqual({ name: 'Yelisson O. Ortiz' })
  })

  it('si el reintento falla por validación, muestra el error del campo y no el aviso de bloqueo', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await rename(
      user,
      lockTimeoutRoute(),
      problem(400, { errors: [{ field: 'name', message: 'Nombre no permitido.' }] }),
    )
    await retryAfterLockTimeout(user, 'Reintentar guardar tu nombre')
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveAccessibleDescription(/Nombre no permitido./),
    )
    expect(
      screen.queryByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).not.toBeInTheDocument()
  })
})
