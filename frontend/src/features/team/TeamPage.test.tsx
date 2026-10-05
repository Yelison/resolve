import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { sessionKeys } from '../session/queries'
import { ticketKeys } from '../tickets/queries'
import { TeamPage } from './TeamPage'
import { memberKeys } from './queries'
import { teamMember, teamMetrics } from './teamFixtures'

const agentMe = {
  ...adminMe,
  user: { id: 'u-laura', name: 'Laura Méndez', email: 'laura@acme.example' },
  role: 'agent',
}

const problem = (status: number, detail: string) => ({ status, body: { status, title: 'Conflicto', detail } })

const team = [
  teamMember({ id: 'u-admin', name: 'Yelisson Ortiz', email: 'yelisson@acme.example', role: 'admin', openTickets: 0 }),
  teamMember(),
  teamMember({ id: 'u-sofia', name: 'Sofía Ríos', email: 'sofia@acme.example', status: 'invited', openTickets: 0 }),
  teamMember({ id: 'u-old', name: 'Pablo Viejo', email: 'pablo@acme.example', status: 'removed', openTickets: 0 }),
]

const baseRoutes = {
  'GET /api/me': { body: adminMe },
  'GET /api/members': { body: team },
  'GET /api/members/metrics': { body: teamMetrics },
}

function renderTeam(path = '/equipo') {
  const router = createMemoryRouter(
    [
      { path: '/equipo', element: <TeamPage /> },
      { path: '/configuracion/permisos', element: <p>Permisos</p> },
    ],
    { initialEntries: [path] },
  )
  const { queryClient } = renderWithProviders(<RouterProvider router={router} />)
  return { router, queryClient }
}

const requestsTo = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.map(([input]) => new URL((input as Request).url)).filter((url) => url.pathname === path)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TeamPage', () => {
  it('muestra un esqueleto mientras carga', () => {
    mockApi({ ...baseRoutes, 'GET /api/members': () => new Promise(() => {}) as never })
    renderTeam()
    expect(screen.getByText('Cargando el equipo…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('muestra las cuatro métricas y el equipo actual sin los retirados', async () => {
    mockApi(baseRoutes)
    renderTeam()
    const table = await screen.findByRole('table', { name: 'Equipo' })
    expect(within(table).getAllByRole('row')).toHaveLength(4) // encabezado + 3
    expect(within(table).queryByText('Pablo Viejo')).not.toBeInTheDocument()
    expect(within(table).getByText('Invitación pendiente')).toBeInTheDocument()
    const metric = (label: string) => screen.getByText(label).closest('dl')!
    expect(metric('Agentes')).toHaveTextContent('4')
    expect(metric('Tickets asignados')).toHaveTextContent('10')
    expect(metric('Tickets asignados')).toHaveTextContent('1 sin asignar')
    expect(metric('Carga promedio')).toHaveTextContent('2,5')
    expect(metric('Carga promedio')).toHaveTextContent('Tickets por agente')
    expect(metric('Primera respuesta')).toHaveTextContent('18 min')
    expect(metric('Primera respuesta')).toHaveTextContent('Objetivo: 30 min')
  })

  it('sin datos de primera respuesta lo dice', async () => {
    mockApi({ ...baseRoutes, 'GET /api/members/metrics': { body: { ...teamMetrics, firstResponseMinutes: null } } })
    renderTeam()
    expect(await screen.findByText('Sin datos')).toBeInTheDocument()
  })

  it('el aviso de permisos enlaza a /configuracion/permisos', async () => {
    mockApi(baseRoutes)
    renderTeam()
    expect(await screen.findByRole('link', { name: 'Ver permisos por rol' })).toHaveAttribute(
      'href',
      '/configuracion/permisos',
    )
  })

  it('los retirados solo aparecen tras el filtro «Retirados»', async () => {
    mockApi(baseRoutes)
    const { router } = renderTeam()
    await screen.findByRole('table', { name: 'Equipo' })
    await userEvent.click(screen.getByRole('button', { name: 'Estado' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Retirados' }))
    const table = await screen.findByRole('table', { name: 'Equipo' })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByText('Pablo Viejo')).toBeInTheDocument()
    expect(within(table).getByText('Retirado')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?estado=retirados')
    // Los retirados no tienen acciones.
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument()
  })

  it('sin retirados el filtro explica que no hay ninguno y vuelve al equipo actual', async () => {
    mockApi({ ...baseRoutes, 'GET /api/members': { body: [teamMember()] } })
    renderTeam('/equipo?estado=retirados')
    expect(await screen.findByText('No hay miembros retirados')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver el equipo actual' }))
    expect(await screen.findByRole('table', { name: 'Equipo' })).toBeInTheDocument()
  })

  it('un equipo vacío invita al administrador a invitar a la primera persona', async () => {
    mockApi({ ...baseRoutes, 'GET /api/members': { body: [] } })
    renderTeam()
    expect(await screen.findByText('Todavía no hay equipo')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Invitar agente' })).toHaveLength(2)
  })

  it('si falla la carga ofrece reintentar', async () => {
    let attempts = 0
    mockApi({
      ...baseRoutes,
      'GET /api/members': () =>
        attempts++ === 0 ? { status: 500, body: { status: 500, title: 'Error' } } : { body: team },
    })
    renderTeam()
    expect(await screen.findByText('No pudimos cargar el equipo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table', { name: 'Equipo' })).toBeInTheDocument()
  })

  it('si fallan las métricas la lista sigue visible y se pueden reintentar', async () => {
    mockApi({ ...baseRoutes, 'GET /api/members/metrics': { status: 500, body: { status: 500, title: 'Error' } } })
    renderTeam()
    expect(await screen.findByText('No pudimos cargar las métricas del equipo')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Equipo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar cargar las métricas' })).toBeInTheDocument()
  })

  describe('permisos', () => {
    it('un administrador ve «Invitar agente» y el menú de cada fila activa', async () => {
      mockApi(baseRoutes)
      renderTeam()
      expect(await screen.findByRole('button', { name: 'Invitar agente' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Acciones de Laura Méndez' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Acciones de Sofía Ríos' })).toBeInTheDocument()
    })

    it('un agente ve el equipo y las métricas pero ninguna acción de administración', async () => {
      mockApi({ ...baseRoutes, 'GET /api/me': { body: agentMe } })
      renderTeam()
      expect(await screen.findByRole('table', { name: 'Equipo' })).toBeInTheDocument()
      expect(screen.getByText('Carga promedio')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Invitar agente' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument()
    })

    it('un administrador no puede retirarse a sí mismo desde su fila, pero sí cambiar su rol', async () => {
      mockApi(baseRoutes)
      renderTeam()
      await userEvent.click(await screen.findByRole('button', { name: 'Acciones de Yelisson Ortiz' }))
      expect(screen.getByRole('menuitem', { name: 'Cambiar rol' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Retirar del equipo' })).not.toBeInTheDocument()
    })
  })

  describe('invitar', () => {
    it('avisa con honestidad que no se envían correos', async () => {
      mockApi(baseRoutes)
      renderTeam()
      await userEvent.click(await screen.findByRole('button', { name: 'Invitar agente' }))
      const dialog = await screen.findByRole('dialog', { name: 'Invitar agente' })
      expect(
        within(dialog).getByText('La persona entrará con este correo; todavía no enviamos correos de invitación.'),
      ).toBeInTheDocument()
    })

    it('un correo no válido muestra el error en el campo y no llama a la API', async () => {
      const fetchSpy = mockApi(baseRoutes)
      renderTeam()
      await userEvent.click(await screen.findByRole('button', { name: 'Invitar agente' }))
      const dialog = await screen.findByRole('dialog', { name: 'Invitar agente' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Correo' }), 'sin-arroba')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Invitar' }))
      const email = within(dialog).getByRole('textbox', { name: 'Correo' })
      expect(email).toBeInvalid()
      expect(email).toHaveAccessibleDescription('Escribe un correo válido, como nombre@empresa.com.')
      expect(email).toHaveFocus()
      expect(fetchSpy.mock.calls.some(([input]) => (input as Request).method === 'POST')).toBe(false)
    })

    it('el error de campo del servidor se asocia al correo', async () => {
      mockApi({
        ...baseRoutes,
        'POST /api/members': {
          status: 400,
          body: {
            status: 400,
            title: 'Datos no válidos',
            errors: [{ field: 'email', message: 'Ya forma parte del equipo.' }],
          },
        },
      })
      renderTeam()
      await userEvent.click(await screen.findByRole('button', { name: 'Invitar agente' }))
      const dialog = await screen.findByRole('dialog', { name: 'Invitar agente' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Correo' }), 'laura@acme.example')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Invitar' }))
      await waitFor(() =>
        expect(within(dialog).getByRole('textbox', { name: 'Correo' })).toHaveAccessibleDescription(
          'Ya forma parte del equipo.',
        ),
      )
      expect(screen.queryByText('Invitación creada')).not.toBeInTheDocument()
    })

    it('invita con el rol elegido, avisa solo tras la respuesta y recarga la lista', async () => {
      let invited: unknown
      let members = team
      const fetchSpy = mockApi({
        ...baseRoutes,
        'GET /api/members': () => ({ body: members }),
        'POST /api/members': async (request) => {
          invited = await request.json()
          members = [...team, teamMember({ id: 'u-nuevo', name: 'ana', email: 'ana@acme.example', status: 'invited' })]
          return { status: 201, body: members[4] }
        },
      })
      renderTeam()
      await userEvent.click(await screen.findByRole('button', { name: 'Invitar agente' }))
      const dialog = await screen.findByRole('dialog', { name: 'Invitar agente' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Correo' }), ' ana@acme.example ')
      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Rol' }), 'admin')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Invitar' }))
      expect(await screen.findByText('Invitación creada')).toBeInTheDocument()
      expect(invited).toEqual({ email: 'ana@acme.example', role: 'admin' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(await screen.findByText('ana')).toBeInTheDocument()
      expect(
        requestsTo(fetchSpy, '/api/members').filter((url) => url.pathname === '/api/members').length,
      ).toBeGreaterThan(2)
    })
  })

  describe('cambiar rol', () => {
    async function openRoleDialog(name = 'Laura Méndez') {
      await userEvent.click(await screen.findByRole('button', { name: `Acciones de ${name}` }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Cambiar rol' }))
      return screen.findByRole('dialog', { name: 'Cambiar rol' })
    }

    it('envía el rol nuevo y avisa «Rol actualizado» solo tras la respuesta', async () => {
      let body: unknown
      mockApi({
        ...baseRoutes,
        'POST /api/members/u-laura/role': async (request) => {
          body = await request.json()
          return { body: teamMember({ role: 'admin' }) }
        },
      })
      renderTeam()
      const dialog = await openRoleDialog()
      const save = within(dialog).getByRole('button', { name: 'Guardar rol' })
      expect(save).toBeDisabled()
      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Rol' }), 'admin')
      await userEvent.click(save)
      expect(await screen.findByText('Rol actualizado')).toBeInTheDocument()
      expect(body).toEqual({ role: 'admin' })
    })

    it('invalida la sesión: un administrador puede cambiar su propio rol', async () => {
      mockApi({
        ...baseRoutes,
        'POST /api/members/u-admin/role': { body: teamMember({ id: 'u-admin', role: 'agent' }) },
      })
      const { queryClient } = renderTeam()
      const dialog = await openRoleDialog('Yelisson Ortiz')
      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Rol' }), 'agent')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar rol' }))
      await screen.findByText('Rol actualizado')
      await waitFor(() => expect(queryClient.getQueryState(sessionKeys.me)?.dataUpdateCount).toBeGreaterThan(1))
    })

    it('un 409 (último administrador) muestra el detalle del servidor y no avisa de éxito', async () => {
      mockApi({
        ...baseRoutes,
        'POST /api/members/u-admin/role': problem(409, 'Debe quedar al menos un administrador activo.'),
      })
      renderTeam()
      const dialog = await openRoleDialog('Yelisson Ortiz')
      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Rol' }), 'agent')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar rol' }))
      const alert = await within(dialog).findByRole('alert')
      expect(alert).toHaveTextContent('Debe quedar al menos un administrador activo.')
      expect(screen.queryByText('Rol actualizado')).not.toBeInTheDocument()
    })
  })

  describe('retirar', () => {
    async function openRemoveDialog(name = 'Laura Méndez') {
      await userEvent.click(await screen.findByRole('button', { name: `Acciones de ${name}` }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Retirar del equipo' }))
      return screen.findByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
    }

    it('la confirmación nombra al miembro y no retira hasta confirmar', async () => {
      const fetchSpy = mockApi(baseRoutes)
      renderTeam()
      const dialog = await openRemoveDialog()
      expect(dialog).toHaveTextContent('Laura Méndez dejará de poder entrar')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(fetchSpy.mock.calls.some(([input]) => (input as Request).method === 'POST')).toBe(false)
    })

    it('retira, avisa «Miembro retirado» tras la respuesta e invalida equipo, asignables y tickets', async () => {
      const fetchSpy = mockApi({
        ...baseRoutes,
        'POST /api/members/u-laura/remove': { body: teamMember({ status: 'removed' }) },
      })
      const { queryClient } = renderTeam()
      queryClient.setQueryData(memberKeys.assignees(), [])
      queryClient.setQueryData(ticketKeys.detail(1048), {})
      queryClient.setQueryData(ticketKeys.metrics(), {})
      const dialog = await openRemoveDialog()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar a Laura Méndez' }))
      expect(await screen.findByText('Miembro retirado')).toBeInTheDocument()
      const stale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated
      expect(stale(memberKeys.assignees())).toBe(true)
      expect(stale(ticketKeys.metrics())).toBe(true)
      expect(stale(ticketKeys.detail(1048))).toBe(true)
      await waitFor(() => expect(requestsTo(fetchSpy, '/api/members')).toHaveLength(2))
      expect(requestsTo(fetchSpy, '/api/members/metrics')).toHaveLength(2)
    })

    it('un 409 muestra el detalle del servidor dentro del diálogo y no avisa de éxito', async () => {
      mockApi({
        ...baseRoutes,
        'POST /api/members/u-laura/remove': problem(409, 'Debe quedar al menos un administrador activo.'),
      })
      renderTeam()
      const dialog = await openRemoveDialog()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar a Laura Méndez' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Debe quedar al menos un administrador activo.',
      )
      expect(screen.queryByText('Miembro retirado')).not.toBeInTheDocument()
    })
  })
})
