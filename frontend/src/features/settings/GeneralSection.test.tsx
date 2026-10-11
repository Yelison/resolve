import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from '../../app/theme/theme'
import { inOrder, lockTimeoutRoute, retryAfterLockTimeout, type SentRequest } from '../../lib/lockTimeoutTesting'
import { adminMe, customerMe, mockApi, type MockRoute } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { memberKeys } from '../team/queries'
import { reportKeys } from '../reports/queries'
import { sessionKeys } from '../session/queries'
import { ticketKeys } from '../tickets/queries'
import { GeneralSection } from './GeneralSection'
import { mockViewport } from './viewportTesting'

const problem = (status: number, extra: object = {}): MockRoute => ({
  status,
  body: { status, title: 'Error', ...extra },
})
const patches = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls.map(([input]) => input as Request).filter((request) => request.method === 'PATCH')

function mount() {
  const router = createMemoryRouter([{ path: '*', element: <GeneralSection /> }], {
    initialEntries: ['/configuracion/general'],
  })
  return renderWithProviders(<RouterProvider router={router} />)
}

function render(me: object = adminMe, routes: Record<string, MockRoute | (() => MockRoute)> = {}) {
  const fetchSpy = mockApi({ 'GET /api/me': { body: me }, ...routes })
  const { queryClient } = mount()
  return { fetchSpy, queryClient }
}

const name = () => screen.findByRole('textbox', { name: 'Nombre' })
const save = () => screen.getByRole('button', { name: 'Guardar cambios' })

beforeEach(() => {
  mockViewport(1440)
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('General: tu nombre y tus datos de acceso', () => {
  it('muestra un esqueleto mientras carga la sesión', async () => {
    mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    mount()
    expect(await screen.findByText('Cargando tu perfil…')).toBeInTheDocument()
  })

  it('muestra el nombre, el rol y el correo sin un campo para cambiarlo, en los bloques del diseño', async () => {
    render()
    expect(await name()).toHaveValue('Yelisson Ortiz')
    for (const title of ['Cómo te ve tu equipo', 'Datos de acceso', 'Tema']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    expect(screen.getByText('Administrador · Acme Studio')).toBeInTheDocument()
    expect(screen.getByText('yelisson@acme.example')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(save()).toBeDisabled()
  })

  it('«Correo» tiene el mismo estilo de etiqueta que los campos: es un término, no un campo de solo lectura', async () => {
    render()
    await name()
    expect(screen.getByText('Correo').tagName).toBe('DT')
    expect(screen.getByText('Rol').tagName).toBe('DT')
    expect(screen.getByText('Lo gestiona tu inicio de sesión; no se cambia desde aquí.')).toBeInTheDocument()
  })

  it('el personal puede ir a ver qué puede hacer su rol', async () => {
    render()
    await name()
    expect(screen.getByRole('link', { name: 'Ver qué puede hacer' })).toHaveAttribute('href', '/configuracion/permisos')
  })

  it('un cliente ve «Cliente de {espacio}», su texto y ningún enlace a permisos', async () => {
    render(customerMe)
    await name()
    expect(screen.getAllByText('Cliente de Acme Studio')).toHaveLength(2)
    expect(screen.getByText('Así te ve el equipo de soporte de Acme Studio en tus solicitudes.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ver qué puede hacer' })).not.toBeInTheDocument()
  })

  it('dice que el historial conserva el nombre de cada momento', async () => {
    render()
    await name()
    expect(
      screen.getByText(/El historial de actividad conserva el nombre que tenías en cada momento/),
    ).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Cómo te ve tu equipo' })).toHaveFocus()
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

  it('si la sesión no carga, lo dice con «Reintentar» y el tema sigue disponible', async () => {
    mockApi({ 'GET /api/me': problem(500) })
    mount()
    expect(await screen.findByText('No pudimos cargar tu perfil')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar cargar tu perfil' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeInTheDocument()
  })
})

describe('General: la barra de guardar y «Guardar nombre»', () => {
  it('desde 768 px hay barra con «Descartar» y «Guardar cambios», que dice qué cambió', async () => {
    render()
    await name()
    expect(screen.getByText('Sin cambios.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar nombre' })).not.toBeInTheDocument()
    await userEvent.type(await name(), ' x')
    expect(screen.getByText('Tienes cambios sin guardar en «Nombre».')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeEnabled()
  })

  it('«Descartar» devuelve el nombre del servidor y deja el foco en el campo', async () => {
    const { fetchSpy } = render()
    const input = await name()
    await userEvent.clear(input)
    await userEvent.click(save())
    expect(screen.getByText('Escribe tu nombre.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(input).toHaveValue('Yelisson Ortiz')
    expect(input).toHaveFocus()
    expect(screen.queryByText('Escribe tu nombre.')).not.toBeInTheDocument()
    expect(patches(fetchSpy)).toHaveLength(0)
  })

  it('en móvil el nombre lleva su propio «Guardar nombre» y no hay barra', async () => {
    mockViewport(390)
    const { fetchSpy } = render(adminMe, {
      'PATCH /api/me': { body: { ...adminMe, user: { ...adminMe.user, name: 'Yelisson O.' } } },
    })
    const input = await name()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Guardar nombre' })
    expect(button).toBeDisabled()
    await userEvent.clear(input)
    await userEvent.type(input, 'Yelisson O.')
    await userEvent.click(button)
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
    expect(await patches(fetchSpy)[0]!.clone().json()).toEqual({ name: 'Yelisson O.' })
  })
})

describe('General con un 503 de bloqueo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function rename(user: ReturnType<typeof userEvent.setup>, ...replies: Parameters<typeof inOrder>[1][]) {
    const seen: SentRequest[] = []
    mockApi({ 'GET /api/me': { body: adminMe }, 'PATCH /api/me': inOrder(seen, ...replies) })
    mount()
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

describe('General: el tema', () => {
  it('ofrece claro, oscuro y como el sistema en un grupo con nombre, y dice dónde se guarda', async () => {
    render()
    await name()
    const group = screen.getByRole('group', { name: 'Tema' })
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Claro', 'Oscuro', 'Como el sistema'])
    expect(screen.getByText(/Se aplica al momento y se guarda en este navegador/)).toBeInTheDocument()
  })

  it('sin preferencia guardada marca «Como el sistema» y dice cuál es ahora', async () => {
    render()
    await name()
    const system = screen.getByRole('radio', { name: 'Como el sistema' })
    expect(system).toBeChecked()
    expect(system).toHaveAccessibleDescription('Ahora: claro')
  })

  it('elegir oscuro aplica el tema al momento y lo recuerda, sin pasar por la barra de guardar', async () => {
    const { fetchSpy } = render()
    await name()
    await userEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(save()).toBeDisabled()
    expect(screen.getByText('Sin cambios.')).toBeInTheDocument()
    expect(patches(fetchSpy)).toHaveLength(0)
  })

  it('volver a «Como el sistema» quita la preferencia guardada', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render()
    await name()
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Como el sistema' }))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('se maneja con teclado: las flechas cambian la opción', async () => {
    render()
    await name()
    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
  })

  it('las miniaturas son decorativas: el nombre accesible de cada opción es solo su texto', async () => {
    render()
    await name()
    const group = screen.getByRole('group', { name: 'Tema' })
    expect(group.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3)
  })
})
