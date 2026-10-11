import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inOrder, lockTimeoutRoute, retryAfterLockTimeout, type SentRequest } from '../../lib/lockTimeoutTesting'
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

/** `count` agentes activos: «Persona 1» tiene 1 ticket abierto, «Persona 22» tiene 22; los pares llevan un urgente. */
const manyPeople = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    teamMember({
      id: `u-${index + 1}`,
      name: `Persona ${index + 1}`,
      email: `persona${index + 1}@acme.example`,
      openTickets: index + 1,
      urgentOpenTickets: (index + 1) % 2 === 0 ? 1 : 0,
    }),
  )

/** El equipo de las pruebas sin la invitación de Sofía, que no trae fecha: las pruebas de invitaciones parten de cero. */
const teamWithoutInvitations = team.filter((member) => member.status !== 'invited')

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

  it('muestra «Carga ahora» con los totales y solo a las personas activas', async () => {
    mockApi(baseRoutes)
    renderTeam()
    const load = await screen.findByRole('region', { name: 'Carga ahora' })
    // 10 asignados + 1 sin asignar.
    expect(await within(load).findByText('11 tickets abiertos · 1 sin asignar')).toBeInTheDocument()
    const rows = within(within(load).getByRole('list', { name: 'Tickets abiertos por persona' })).getAllByRole(
      'listitem',
    )
    expect(rows).toHaveLength(2)
    // Las iniciales del avatar van delante del nombre.
    expect(rows[0]).toHaveTextContent(/Laura Méndez3 abiertos · 1 urgente$/)
    expect(rows[1]).toHaveTextContent(/Yelisson Ortiz0 abiertos$/)
    // La invitación pendiente y el retirado no atienden tickets.
    expect(within(load).queryByText('Sofía Ríos')).not.toBeInTheDocument()
    expect(within(load).queryByText('Pablo Viejo')).not.toBeInTheDocument()
    // La leyenda nombra los dos colores con palabras.
    expect(within(load).getByRole('list', { name: 'Leyenda' })).toHaveTextContent('UrgentesResto')
  })

  it('con más de ocho personas muestra las más cargadas y «Ver las N personas» las despliega en la misma página', async () => {
    mockApi({ ...baseRoutes, 'GET /api/members': { body: manyPeople(22) } })
    const { router } = renderTeam()
    const load = await screen.findByRole('region', { name: 'Carga ahora' })
    const list = () => within(load).getByRole('list', { name: 'Tickets abiertos por persona' })
    expect(await within(load).findByText(/los 8 más cargados/)).toBeInTheDocument()
    expect(within(list()).getAllByRole('listitem')).toHaveLength(8)
    // De más a menos: la persona 22 es la más cargada.
    expect(within(list()).getAllByRole('listitem')[0]).toHaveTextContent('Persona 22')

    await userEvent.click(within(load).getByRole('button', { name: 'Ver las 22 personas' }))
    expect(router.state.location.search).toBe('?carga=todas')
    expect(within(list()).getAllByRole('listitem')).toHaveLength(22)
    expect(within(load).getByText(/las 22 personas, de más a menos/)).toBeInTheDocument()

    await userEvent.click(within(load).getByRole('button', { name: 'Ver solo las 8 más cargadas' }))
    expect(router.state.location.search).toBe('')
    expect(within(list()).getAllByRole('listitem')).toHaveLength(8)
  })

  it('un enlace con «carga=todas» abre la sección desplegada', async () => {
    mockApi({ ...baseRoutes, 'GET /api/members': { body: manyPeople(12) } })
    renderTeam('/equipo?carga=todas')
    const load = await screen.findByRole('region', { name: 'Carga ahora' })
    expect(await within(load).findByRole('button', { name: 'Ver solo las 8 más cargadas' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('«Ver como tabla» da la alternativa textual con las cifras de cada persona', async () => {
    mockApi(baseRoutes)
    const { router } = renderTeam()
    const load = await screen.findByRole('region', { name: 'Carga ahora' })
    await userEvent.click(await within(load).findByRole('button', { name: 'Ver como tabla' }))
    expect(router.state.location.search).toBe('?vista=tabla')
    const table = within(load).getByRole('table', { name: 'Tickets abiertos por persona' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Persona', 'Abiertos', 'Urgentes', 'Resto'])
    const laura = within(table).getByRole('row', { name: /Laura Méndez/ })
    expect(
      within(laura)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['3', '1', '2'])
    expect(within(load).queryByRole('list', { name: 'Leyenda' })).not.toBeInTheDocument()
    await userEvent.click(within(load).getByRole('button', { name: 'Ver como gráfico' }))
    expect(within(load).queryByRole('table')).not.toBeInTheDocument()
  })

  it('sin personas activas lo dice con palabras de usuario', async () => {
    mockApi({ ...baseRoutes, 'GET /api/members': { body: [team[2]] } })
    renderTeam()
    expect(await screen.findByText('Nadie atiende tickets todavía')).toBeInTheDocument()
  })

  it('si fallan los totales las barras y la lista siguen visibles y se pueden reintentar', async () => {
    let attempts = 0
    mockApi({
      ...baseRoutes,
      'GET /api/members/metrics': () =>
        attempts++ === 0 ? { status: 500, body: { status: 500, title: 'Error' } } : { body: teamMetrics },
    })
    renderTeam()
    expect(await screen.findByText('No pudimos cargar los totales.')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Equipo' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Carga ahora' })).getByText('Laura Méndez')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar los totales de tickets' }))
    expect(await screen.findByText('11 tickets abiertos · 1 sin asignar')).toBeInTheDocument()
  })

  it('si falla el equipo cada parte lo dice con su propio reintento y los totales siguen ahí', async () => {
    let attempts = 0
    mockApi({
      ...baseRoutes,
      'GET /api/members': () =>
        attempts++ === 0 ? { status: 500, body: { status: 500, title: 'Error' } } : { body: team },
    })
    renderTeam()
    expect(await screen.findByText('No pudimos cargar la carga del equipo')).toBeInTheDocument()
    expect(screen.getByText('No pudimos cargar el equipo')).toBeInTheDocument()
    expect(await screen.findByText('11 tickets abiertos · 1 sin asignar')).toBeInTheDocument()
    // Los roles conservan su enlace aunque falle la lista.
    expect(screen.getByRole('link', { name: 'Ver permisos por rol' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cargar la lista de miembros' }))
    expect(await screen.findByRole('table', { name: 'Equipo' })).toBeInTheDocument()
    expect(screen.queryByText('No pudimos cargar la carga del equipo')).not.toBeInTheDocument()
  })

  it('«Roles» cuenta a administradores y agentes activos y enlaza a los permisos', async () => {
    mockApi(baseRoutes)
    renderTeam()
    const roles = await screen.findByRole('region', { name: 'Roles' })
    expect(await within(roles).findByText('Administradores')).toBeInTheDocument()
    expect(within(roles).getByText('Administradores').nextElementSibling).toHaveTextContent('1')
    // Laura (activa); Sofía está invitada y Pablo retirado.
    expect(within(roles).getByText('Agentes').nextElementSibling).toHaveTextContent('1')
    const link = within(roles).getByRole('link', { name: 'Ver permisos por rol' })
    expect(link).toHaveAttribute('href', '/configuracion/permisos')
    expect(screen.getByRole('heading', { level: 1, name: 'Equipo' }).closest('header')).not.toContainElement(link)
  })

  it('la lista muestra el equipo actual sin los retirados, con su carga y los urgentes con palabras', async () => {
    mockApi(baseRoutes)
    renderTeam()
    const table = await screen.findByRole('table', { name: 'Equipo' })
    expect(within(table).getAllByRole('row')).toHaveLength(4) // encabezado + 3
    expect(within(table).queryByText('Pablo Viejo')).not.toBeInTheDocument()
    expect(within(table).getByText('Invitación pendiente')).toBeInTheDocument()
    expect(within(within(table).getByRole('row', { name: /Laura Méndez/ })).getByText('1 urgente')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Miembros 3' })).toBeInTheDocument()
  })

  it('los retirados solo aparecen tras el filtro «Retirados» y el chip lo quita', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Quitar el filtro Estado: Retirados' }))
    expect(router.state.location.search).toBe('')
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
    // Sin invitaciones el panel no se muestra.
    expect(screen.queryByRole('region', { name: /Invitaciones pendientes/ })).not.toBeInTheDocument()
  })

  it('busca por nombre o correo y filtra por rol, y sin coincidencias ofrece quitar los filtros', async () => {
    mockApi(baseRoutes)
    const { router } = renderTeam()
    await screen.findByRole('table', { name: 'Equipo' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar miembros' }), 'LAURA@')
    await waitFor(() => expect(router.state.location.search).toBe('?q=LAURA%40'))
    const table = screen.getByRole('table', { name: 'Equipo' })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 2, name: 'Miembros 1 de 3' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Rol' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Administrador' }))
    expect(await screen.findByText('No encontramos miembros')).toBeInTheDocument()
    expect(router.state.location.search).toContain('rol=administrador')
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))
    expect(await screen.findByRole('table', { name: 'Equipo' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('searchbox', { name: 'Buscar miembros' })).toHaveValue('')
  })

  it('pagina de diez en diez y avisa cuando la página de la URL ya no existe', async () => {
    mockApi({ ...baseRoutes, 'GET /api/members': { body: manyPeople(25) } })
    const { router } = renderTeam()
    const table = await screen.findByRole('table', { name: 'Equipo' })
    expect(within(table).getAllByRole('row')).toHaveLength(11)
    expect(screen.getByText('1–10 de 25 resultados')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Página 3' }))
    expect(router.state.location.search).toBe('?pagina=3')
    expect(within(screen.getByRole('table', { name: 'Equipo' })).getAllByRole('row')).toHaveLength(6)
    await router.navigate('/equipo?pagina=9')
    expect(await screen.findByText('Esta página ya no existe')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ir a la primera página' }))
    expect(await screen.findByText('1–10 de 25 resultados')).toBeInTheDocument()
  })

  describe('invitaciones pendientes', () => {
    const invited = (index: number, daysAgo: number) =>
      teamMember({
        id: `u-inv-${index}`,
        name: `invitada${index}`,
        email: `invitada${index}@acme.example`,
        status: 'invited',
        openTickets: 0,
        urgentOpenTickets: 0,
        joinedAt: null,
        invitedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      })

    it('lista el correo, el rol y cuándo se envió, sin «Reenviar» ni «Caducada»', async () => {
      mockApi({ ...baseRoutes, 'GET /api/members': { body: [...teamWithoutInvitations, invited(1, 2)] } })
      renderTeam()
      const panel = await screen.findByRole('region', { name: /Invitaciones pendientes/ })
      expect(within(panel).getByRole('heading', { name: 'Invitaciones pendientes 1' })).toBeInTheDocument()
      expect(within(panel).getByText('invitada1@acme.example')).toBeInTheDocument()
      expect(within(panel).getByText('Agente · Enviada hace 2 días')).toBeInTheDocument()
      expect(screen.queryByText(/Reenviar|Caducada/)).not.toBeInTheDocument()
      // Con tres o menos no hay «Ver las N».
      expect(within(panel).queryByRole('button', { name: /Ver las/ })).not.toBeInTheDocument()
    })

    it('se ven las tres más recientes y «Ver las N» filtra la lista, oculta el panel y el chip lo deshace', async () => {
      const five = [1, 2, 3, 4, 5].map((index) => invited(index, index))
      mockApi({ ...baseRoutes, 'GET /api/members': { body: [...teamWithoutInvitations, ...five] } })
      const { router } = renderTeam()
      const panel = await screen.findByRole('region', { name: /Invitaciones pendientes/ })
      expect(
        within(panel)
          .getAllByRole('listitem')
          .map((item) => item.querySelector('span span')?.textContent),
      ).toEqual(['invitada1@acme.example', 'invitada2@acme.example', 'invitada3@acme.example'])
      expect(within(panel).getByRole('heading', { name: 'Invitaciones pendientes 5' })).toBeInTheDocument()

      await userEvent.click(within(panel).getByRole('button', { name: 'Ver las 5 invitaciones pendientes' }))
      expect(router.state.location.search).toBe('?estado=invitados')
      expect(screen.queryByRole('region', { name: /Invitaciones pendientes/ })).not.toBeInTheDocument()
      const table = screen.getByRole('table', { name: 'Equipo' })
      expect(within(table).getAllByRole('row')).toHaveLength(6)
      expect(screen.getByRole('heading', { level: 2, name: 'Miembros 5 de 7' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Quitar el filtro Estado: Invitación pendiente' }))
      expect(router.state.location.search).toBe('')
      expect(await screen.findByRole('region', { name: /Invitaciones pendientes/ })).toBeInTheDocument()
    })

    it('«Cancelar invitación» pide confirmar, usa la API de retirar y avisa solo tras la respuesta', async () => {
      const fetchSpy = mockApi({
        ...baseRoutes,
        'GET /api/members': { body: [...teamWithoutInvitations, invited(1, 2), invited(2, 3)] },
        'POST /api/members/u-inv-1/remove': { body: { ...invited(1, 2), status: 'removed' } },
      })
      renderTeam()
      const panel = await screen.findByRole('region', { name: /Invitaciones pendientes/ })
      await userEvent.click(
        within(panel).getByRole('button', { name: 'Cancelar la invitación de invitada1@acme.example' }),
      )
      const dialog = await screen.findByRole('dialog', { name: '¿Cancelar esta invitación?' })
      expect(dialog).toHaveTextContent('invitada1@acme.example')
      expect(requestsTo(fetchSpy, '/api/members/u-inv-1/remove')).toHaveLength(0)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar invitación' }))
      expect(await screen.findByText('Invitación cancelada')).toBeInTheDocument()
      expect(requestsTo(fetchSpy, '/api/members/u-inv-1/remove')).toHaveLength(1)
      // Quedaba otra invitación: el foco va a su panel, no se pierde en el body.
      await waitFor(() => expect(screen.getByRole('heading', { name: /Invitaciones pendientes/ })).toHaveFocus())
    })

    it('cancelar la última invitación lleva el foco al título de la página', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/members': { body: [...teamWithoutInvitations, invited(1, 2)] },
        'POST /api/members/u-inv-1/remove': { body: { ...invited(1, 2), status: 'removed' } },
      })
      renderTeam()
      const panel = await screen.findByRole('region', { name: /Invitaciones pendientes/ })
      await userEvent.click(within(panel).getByRole('button', { name: /Cancelar la invitación de/ }))
      const dialog = await screen.findByRole('dialog', { name: '¿Cancelar esta invitación?' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar invitación' }))
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Equipo' })).toHaveFocus())
    })

    it('un error al cancelar se anuncia en el diálogo y no avisa de éxito', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/members': { body: [...teamWithoutInvitations, invited(1, 2)] },
        'POST /api/members/u-inv-1/remove': problem(409, 'El miembro ya fue retirado del equipo.'),
      })
      renderTeam()
      const panel = await screen.findByRole('region', { name: /Invitaciones pendientes/ })
      await userEvent.click(within(panel).getByRole('button', { name: /Cancelar la invitación de/ }))
      const dialog = await screen.findByRole('dialog', { name: '¿Cancelar esta invitación?' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar invitación' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('El miembro ya fue retirado del equipo.')
      expect(screen.queryByText('Invitación cancelada')).not.toBeInTheDocument()
    })
  })

  describe('permisos', () => {
    it('un administrador ve «Invitar agente» y el menú de cada fila activa', async () => {
      mockApi(baseRoutes)
      renderTeam()
      expect(await screen.findByRole('button', { name: 'Invitar agente' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Acciones de Laura Méndez' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Acciones de Sofía Ríos' })).toBeInTheDocument()
    })

    it('un agente ve la carga, los roles y los miembros, sin invitar, sin invitaciones y sin menú de acciones', async () => {
      mockApi({
        ...baseRoutes,
        'GET /api/me': { body: agentMe },
        'GET /api/members': {
          body: [...team, teamMember({ id: 'u-inv', status: 'invited', invitedAt: new Date().toISOString() })],
        },
      })
      renderTeam()
      expect(await screen.findByRole('table', { name: 'Equipo' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Carga ahora' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Roles' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Invitar agente' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: /Invitaciones pendientes/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Cancelar la invitación/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument()
    })

    it('mientras se carga la sesión no se dibuja ninguna acción de administración', async () => {
      mockApi({ ...baseRoutes, 'GET /api/me': () => new Promise(() => {}) as never })
      renderTeam()
      expect(await screen.findByRole('table', { name: 'Equipo' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Invitar agente' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: /Invitaciones pendientes/ })).not.toBeInTheDocument()
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
        within(dialog).getByText('La persona entrará con este correo. No enviamos un aviso automático: avísale tú.'),
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
      expect(screen.getByText('Laura Méndez ahora tiene el rol de administrador.')).toBeInTheDocument()
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
      await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar del equipo' }))
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
      await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar del equipo' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Debe quedar al menos un administrador activo.',
      )
      expect(screen.queryByText('Miembro retirado')).not.toBeInTheDocument()
    })
  })

  describe('errores de permiso y de estado', () => {
    const forbidden = {
      status: 403,
      body: { status: 403, title: 'Prohibido', detail: 'Tu rol no permite esta acción.' },
    }

    // Tras el 403 la sesión se relee y ahora es la de un agente: las acciones de administración desaparecen.
    function degradedAfterForbidden(post: string) {
      let role = adminMe
      mockApi({
        ...baseRoutes,
        'GET /api/me': () => ({ body: role }),
        [post]: () => {
          role = agentMe as typeof adminMe
          return forbidden
        },
      })
    }

    it('retirar con un 403 muestra su detalle, relee la sesión y quita las acciones', async () => {
      degradedAfterForbidden('POST /api/members/u-laura/remove')
      renderTeam()
      await userEvent.click(await screen.findByRole('button', { name: 'Acciones de Laura Méndez' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Retirar del equipo' }))
      const dialog = await screen.findByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar del equipo' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tu rol no permite esta acción.')
      expect(dialog).not.toHaveTextContent('Revisa tu conexión')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Invitar agente' })).not.toBeInTheDocument())
      expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument()
    })

    it('al cerrar el diálogo cuyo disparador ya no existe el foco va al título de la página', async () => {
      degradedAfterForbidden('POST /api/members/u-laura/remove')
      renderTeam()
      await userEvent.click(await screen.findByRole('button', { name: 'Acciones de Laura Méndez' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Retirar del equipo' }))
      const dialog = await screen.findByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar del equipo' }))
      await within(dialog).findByRole('alert')
      await waitFor(() => expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument())
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Equipo' })).toHaveFocus())
    })

    it('cambiar el rol con un 403 muestra su detalle y relee la sesión', async () => {
      degradedAfterForbidden('POST /api/members/u-laura/role')
      const { queryClient } = renderTeam()
      await userEvent.click(await screen.findByRole('button', { name: 'Acciones de Laura Méndez' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Cambiar rol' }))
      const dialog = await screen.findByRole('dialog', { name: 'Cambiar rol' })
      await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Rol' }), 'admin')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar rol' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tu rol no permite esta acción.')
      await waitFor(() => expect(queryClient.getQueryData(sessionKeys.me)).toMatchObject({ role: 'agent' }))
    })

    it('invitar con un 403 muestra su detalle y relee la sesión', async () => {
      degradedAfterForbidden('POST /api/members')
      renderTeam()
      await userEvent.click(await screen.findByRole('button', { name: 'Invitar agente' }))
      const dialog = await screen.findByRole('dialog', { name: 'Invitar agente' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Correo' }), 'ana@acme.example')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Invitar' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tu rol no permite esta acción.')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Invitar agente' })).not.toBeInTheDocument())
    })

    it('un 409 relee equipo, métricas y asignables', async () => {
      mockApi({
        ...baseRoutes,
        'POST /api/members/u-laura/remove': problem(409, 'El miembro ya fue retirado del equipo.'),
      })
      const { queryClient } = renderTeam()
      queryClient.setQueryData(memberKeys.assignees(), [])
      await userEvent.click(await screen.findByRole('button', { name: 'Acciones de Laura Méndez' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Retirar del equipo' }))
      const dialog = await screen.findByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar del equipo' }))
      await within(dialog).findByRole('alert')
      const stale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated
      await waitFor(() => expect(stale(memberKeys.assignees())).toBe(true))
    })
  })
})

describe('TeamPage con un 503 de bloqueo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  async function openMenu(user: ReturnType<typeof setup>, item: string, dialogName: string) {
    await user.click(await screen.findByRole('button', { name: 'Acciones de Laura Méndez' }))
    await user.click(screen.getByRole('menuitem', { name: item }))
    return screen.findByRole('dialog', { name: dialogName })
  }

  it('invitar conserva lo escrito, ofrece «Reintentar» y repite la misma petición', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    mockApi({
      ...baseRoutes,
      'POST /api/members': inOrder(seen, lockTimeoutRoute(), {
        status: 201,
        body: teamMember({ id: 'u-nuevo', name: 'ana', email: 'ana@acme.example', status: 'invited' }),
      }),
    })
    renderTeam()
    await user.click(await screen.findByRole('button', { name: 'Invitar agente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invitar agente' })
    const email = within(dialog).getByRole('textbox', { name: 'Correo' })
    await user.type(email, 'ana@acme.example')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Rol' }), 'admin')
    await user.click(within(dialog).getByRole('button', { name: 'Invitar' }))

    expect(
      await within(dialog).findByText(
        'Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('No se pudo crear la invitación')).not.toBeInTheDocument()
    expect(email).toHaveValue('ana@acme.example')
    expect(within(dialog).getByRole('combobox', { name: 'Rol' })).toHaveValue('admin')

    await retryAfterLockTimeout(user, 'Reintentar crear la invitación')
    expect(await screen.findByText('Invitación creada')).toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    expect(JSON.parse(seen[0]?.body ?? '')).toEqual({ email: 'ana@acme.example', role: 'admin' })
  })

  it('invitar: si el reintento falla por validación, muestra el error del campo de siempre', async () => {
    const user = setup()
    mockApi({
      ...baseRoutes,
      'POST /api/members': inOrder([], lockTimeoutRoute(), {
        status: 400,
        body: {
          status: 400,
          title: 'Datos no válidos',
          errors: [{ field: 'email', message: 'Ya forma parte del equipo.' }],
        },
      }),
    })
    renderTeam()
    await user.click(await screen.findByRole('button', { name: 'Invitar agente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invitar agente' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Correo' }), 'laura@acme.example')
    await user.click(within(dialog).getByRole('button', { name: 'Invitar' }))
    await retryAfterLockTimeout(user, 'Reintentar crear la invitación')
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Correo' })).toHaveAccessibleDescription(
        'Ya forma parte del equipo.',
      ),
    )
    expect(
      within(dialog).queryByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).not.toBeInTheDocument()
  })

  it('cambiar el rol mantiene el diálogo, ofrece «Reintentar» y repite la misma petición', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    mockApi({
      ...baseRoutes,
      'POST /api/members/u-laura/role': inOrder(seen, lockTimeoutRoute(), { body: teamMember({ role: 'admin' }) }),
    })
    renderTeam()
    const dialog = await openMenu(user, 'Cambiar rol', 'Cambiar rol')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Rol' }), 'admin')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar rol' }))

    expect(
      await within(dialog).findByText(
        'Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('No se pudo cambiar el rol')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Rol' })).toHaveValue('admin')
    await retryAfterLockTimeout(user, 'Reintentar cambiar el rol')
    expect(await screen.findByText('Rol actualizado')).toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    expect(JSON.parse(seen[0]?.body ?? '')).toEqual({ role: 'admin' })
  })

  it('cambiar el rol: si el reintento recibe un 409 muestra su detalle como siempre', async () => {
    const user = setup()
    mockApi({
      ...baseRoutes,
      'POST /api/members/u-laura/role': inOrder([], lockTimeoutRoute(), {
        status: 409,
        body: { status: 409, title: 'Conflicto', detail: 'Debe quedar al menos un administrador activo.' },
      }),
    })
    renderTeam()
    const dialog = await openMenu(user, 'Cambiar rol', 'Cambiar rol')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Rol' }), 'admin')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar rol' }))
    await retryAfterLockTimeout(user, 'Reintentar cambiar el rol')
    expect(await within(dialog).findByText('Debe quedar al menos un administrador activo.')).toBeInTheDocument()
    // El aviso de bloqueo se fue con el foco dentro: sigue en el diálogo, no cae en `body`.
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    expect(
      within(dialog).queryByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).not.toBeInTheDocument()
  })

  it('retirar mantiene el diálogo, ofrece «Reintentar» y repite la misma petición', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    mockApi({
      ...baseRoutes,
      'POST /api/members/u-laura/remove': inOrder(seen, lockTimeoutRoute(), {
        body: teamMember({ status: 'removed' }),
      }),
    })
    renderTeam()
    const dialog = await openMenu(user, 'Retirar del equipo', '¿Retirar a este miembro del equipo?')
    await user.click(within(dialog).getByRole('button', { name: 'Retirar del equipo' }))

    expect(
      await within(dialog).findByText(
        'Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('No se pudo retirar al miembro')).not.toBeInTheDocument()
    await retryAfterLockTimeout(user, 'Reintentar retirar al miembro')
    expect(await screen.findByText('Miembro retirado')).toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
  })

  it('retirar: si el reintento recibe un 404 muestra su detalle como siempre', async () => {
    const user = setup()
    mockApi({
      ...baseRoutes,
      'POST /api/members/u-laura/remove': inOrder([], lockTimeoutRoute(), {
        status: 404,
        body: { status: 404, title: 'No encontrado', detail: 'Ese miembro ya no existe.' },
      }),
    })
    renderTeam()
    const dialog = await openMenu(user, 'Retirar del equipo', '¿Retirar a este miembro del equipo?')
    await user.click(within(dialog).getByRole('button', { name: 'Retirar del equipo' }))
    await retryAfterLockTimeout(user, 'Reintentar retirar al miembro')
    expect(await within(dialog).findByText('Ese miembro ya no existe.')).toBeInTheDocument()
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    expect(
      within(dialog).queryByText('Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'),
    ).not.toBeInTheDocument()
  })
})
