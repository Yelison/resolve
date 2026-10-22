import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, SESSION_CHANGED_DETAIL } from '../../api/client'
import type { Me, OrganizationRef } from '../../api/schema'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { releaseWrites } from './sessionLifecycle'
import { renderShell, setCsrfCookie } from './shellHarness'
import { orgA, orgB, orgC } from './workspaceFixtures'

const inOrg = (base: typeof adminMe | typeof customerMe, org: OrganizationRef, all: OrganizationRef[]) =>
  ({
    ...base,
    role: org.role,
    organization: { ...base.organization, id: org.id, name: org.name, color: org.color },
    organizations: all,
  }) as Me

const meInAcme = inOrg(adminMe, orgA, [orgA, orgB, orgC])
const meInNorthwind = inOrg(adminMe, orgB, [orgA, orgB, orgC])

/** La tarjeta del espacio: nombre accesible completo aunque el texto se corte. */
const card = (name = 'Acme Studio') => screen.findByRole('button', { name: `Espacio: ${name}. Cambiar de espacio` })

async function openSwitcher(name?: string) {
  await userEvent.click(await card(name))
  return screen.getByRole('menu', { name: 'Cambiar de espacio' })
}

const requests = (spy: ReturnType<typeof mockApi>) => spy.mock.calls.map(([input]) => input as Request)

const manySpaces = (count: number): OrganizationRef[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `0192f000-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`,
    name: index === 0 ? 'Acme Studio' : `Espacio ${index + 1}`,
    role: index % 2 === 0 ? 'admin' : 'agent',
    color: 'blue',
    memberCount: index + 2,
  }))

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

describe('selector de espacios · tarjeta del sidebar', () => {
  it('la tarjeta lleva el nombre del espacio y tu rol, y abre el selector', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell()
    const trigger = await card()
    expect(trigger).toHaveTextContent('Acme Studio')
    expect(trigger).toHaveTextContent('Administrador')
    expect(trigger).not.toHaveTextContent('Espacio de trabajo')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('el color del espacio pinta el cuadro de la tarjeta y el de cada fila, sin que el color sea la única pista', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell()
    const trigger = await card()
    expect(within(trigger).getByText('AS')).toHaveAttribute('data-color', 'green')
    const menu = await openSwitcher()
    const rows = within(menu).getAllByRole('menuitemradio')
    expect(rows.map((row) => row.querySelector('[data-color]')?.getAttribute('data-color'))).toEqual([
      'green',
      'magenta',
      'orange',
    ])
    // Cada fila conserva su nombre y su rol en texto.
    expect(rows[1]).toHaveTextContent('Northwind')
    expect(rows[1]).toHaveTextContent('Agente')
  })

  it('cada fila lleva su rol y marca el espacio actual; «Crear espacio» va tras el separador y antes de «Tus espacios»', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell()
    const menu = await openSwitcher()
    const rows = within(menu).getAllByRole('menuitemradio')
    // El nombre accesible de cada fila es el del espacio; su rol es la descripción (`aria-describedby`).
    const spaces = [
      ['Acme Studio', 'Administrador'],
      ['Northwind', 'Agente'],
      ['Norte Viajes', 'Cliente'],
    ] as const
    expect(rows).toHaveLength(spaces.length)
    spaces.forEach(([name, role], index) => {
      expect(rows[index]).toHaveAccessibleName(name)
      expect(rows[index]).toHaveAccessibleDescription(role)
    })
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    // Un solo separador: el de «Crear espacio», que abre el bloque de acciones.
    expect(within(menu).getAllByRole('separator')).toHaveLength(1)
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Crear espacio', 'Tus espacios'])
    // Se abre sobre la opción elegida.
    await waitFor(() => expect(rows[0]).toHaveFocus())
  })

  it('sin permiso para crear (`allowed: false`) el selector no ofrece «Crear espacio», aunque seas administrador aquí', async () => {
    const me = {
      ...meInAcme,
      organizationCreation: { allowed: false, created: 3, limit: 3 },
    } as Me
    mockApi({ 'GET /api/me': { body: me } })
    renderShell()
    const menu = await openSwitcher()
    expect(within(menu).queryByRole('menuitem', { name: /Crear espacio/ })).not.toBeInTheDocument()
    // Sin «Crear espacio», el separador abre «Tus espacios».
    expect(within(menu).getAllByRole('separator')).toHaveLength(1)
    expect(within(menu).getByRole('menuitem', { name: 'Tus espacios' })).toBeInTheDocument()
  })

  it('un agente con permiso en otro espacio (`allowed: true`) ve «Crear espacio» aunque aquí no administre', async () => {
    const me = { ...inOrg(adminMe, orgB, [orgA, orgB]), organizationCreation: { allowed: true, created: 1, limit: 3 } }
    mockApi({ 'GET /api/me': { body: me } })
    renderShell()
    const menu = await openSwitcher('Northwind')
    expect(within(menu).getByRole('menuitem', { name: 'Crear espacio' })).toBeInTheDocument()
  })

  it('en una sesión de cliente no hay «Crear espacio», aunque la persona administre otro espacio', async () => {
    const lumen: OrganizationRef = { ...orgC, name: 'Lumen Diseño' }
    const me = {
      ...inOrg(customerMe, orgC, [orgC, lumen, orgA]),
      organizationCreation: { allowed: true, created: 1, limit: 3 },
    } as Me
    mockApi({ 'GET /api/me': { body: me } })
    renderShell()
    await userEvent.click(await card('Norte Viajes'))
    const menu = screen.getByRole('menu', { name: 'Cambiar de espacio' })
    expect(within(menu).queryByRole('menuitem')).not.toBeInTheDocument()
  })

  it('un nombre de 120 caracteres se corta con «…» pero conserva el nombre completo accesible', async () => {
    const long = 'Clínica '.repeat(15).slice(0, 119).trimEnd() + 'x'
    const me = inOrg(adminMe, { ...orgA, name: long }, [{ ...orgA, name: long }, orgB])
    mockApi({ 'GET /api/me': { body: me } })
    renderShell()
    const menu = await openSwitcher(long)
    const row = within(menu).getByRole('menuitemradio', { name: long })
    expect(row).toHaveAccessibleDescription('Administrador')
    expect(row).toHaveAttribute('title', long)
    expect(await card(long)).toHaveAttribute('title', long)
  })

  it('elegir otro espacio lo cambia: envía la elección, vuelve a Inicio, vacía la caché y avisa', async () => {
    const spy = mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/session/organization': { body: meInNorthwind },
    })
    sessionStorage.setItem('resolve-draft-1046', 'Borrador del otro espacio')
    const { queryClient, router } = renderShell('/tickets/1046')
    queryClient.setQueryData(['tickets', 'detail', 1046], { subject: 'Ticket de Acme' })
    const menu = await openSwitcher()
    const northwind = within(menu).getByRole('menuitemradio', { name: 'Northwind' })
    expect(northwind).toHaveAccessibleDescription('Agente')
    await userEvent.click(northwind)

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    const post = requests(spy).find((request) => request.url.endsWith('/api/session/organization'))!
    expect(post.headers.get('X-XSRF-TOKEN')).toBe('token-1')
    await expect(post.clone().json()).resolves.toEqual({ organizationId: orgB.id })
    expect(queryClient.getQueryData(['tickets', 'detail', 1046])).toBeUndefined()
    expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
    expect(await card('Northwind')).toHaveTextContent('Agente')
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Ahora trabajas en Northwind')).toBeInTheDocument()
    expect(document.body).not.toHaveFocus()
  })

  it('elegir el espacio actual cierra el menú sin pedir nada y devuelve el foco a la tarjeta', async () => {
    const spy = mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell()
    const menu = await openSwitcher()
    const acme = within(menu).getByRole('menuitemradio', { name: 'Acme Studio' })
    expect(acme).toHaveAccessibleDescription('Administrador')
    await userEvent.click(acme)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(requests(spy).some((request) => request.method === 'POST')).toBe(false)
    expect(await card()).toHaveFocus()
  })

  it('«Tus espacios» lleva a Configuración', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    const { router } = renderShell('/tickets')
    router.routes[0]!.children!.push({ path: 'configuracion/espacios', element: <h1>Tus espacios</h1> })
    await userEvent.click(within(await openSwitcher()).getByRole('menuitem', { name: 'Tus espacios' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/configuracion/espacios'))
  })

  it('con un solo espacio el personal también lo abre: necesita «Tus espacios»', async () => {
    mockApi({ 'GET /api/me': { body: inOrg(adminMe, orgA, [orgA]) } })
    renderShell()
    const menu = await openSwitcher()
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(1)
    expect(within(menu).getByRole('menuitem', { name: 'Tus espacios' })).toBeInTheDocument()
  })

  it('con el menú abierto, flechas, Inicio/Fin y Escape devuelven el foco a la tarjeta', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell()
    const menu = await openSwitcher()
    await waitFor(() => expect(within(menu).getByRole('menuitemradio', { name: /^Acme/ })).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    expect(within(menu).getByRole('menuitemradio', { name: /^Northwind/ })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(within(menu).getByRole('menuitem', { name: 'Tus espacios' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(await card()).toHaveFocus()
  })

  it('un 403 avisa de que ya no hay acceso a ese espacio y relee la sesión', async () => {
    let meReads = 0
    mockApi({
      'GET /api/me': () => {
        meReads += 1
        return { body: meInAcme }
      },
      'POST /api/session/organization': { status: 403, body: { status: 403, title: 'Sin permiso' } },
    })
    renderShell()
    await userEvent.click(within(await openSwitcher()).getByRole('menuitemradio', { name: /^Northwind/ }))
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('No pudimos cambiar de espacio')).toBeInTheDocument()
    expect(within(region).getByText('Ya no tienes acceso a ese espacio. Elige otro.')).toBeInTheDocument()
    await waitFor(() => expect(meReads).toBe(2))
  })

  it('un 401 dice que la sesión caducó en lugar de culpar a la conexión', async () => {
    mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/session/organization': { status: 401, body: { status: 401, title: 'No autenticado' } },
    })
    renderShell()
    await userEvent.click(within(await openSwitcher()).getByRole('menuitemradio', { name: /^Northwind/ }))
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Tu sesión caducó. Vuelve a entrar y repite el cambio.')).toBeInTheDocument()
  })

  it('en la misma pestaña, la escritura que sale entre la elección y la llegada de la pantalla nueva recibe el 409', async () => {
    let loadHome!: () => void
    const home = new Promise<void>((resolve) => (loadHome = resolve))
    let writes = 0
    mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/session/organization': { body: meInNorthwind },
      'PATCH /api/me': () => {
        writes += 1
        return { body: adminMe }
      },
    })
    const { router } = renderShell('/tickets/1046', home)
    await userEvent.click(within(await openSwitcher()).getByRole('menuitemradio', { name: /^Northwind/ }))

    await card('Northwind')
    expect(router.state.location.pathname).toBe('/tickets/1046')
    const blocked = await api.PATCH('/me', { body: { name: 'Yelisson' } })
    expect(blocked.response.status).toBe(409)
    expect(blocked.error).toMatchObject({ detail: SESSION_CHANGED_DETAIL })
    expect(writes).toBe(0)

    loadHome()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
    await waitFor(async () => {
      expect((await api.PATCH('/me', { body: { name: 'Yelisson' } })).response.status).toBe(200)
    })
    expect(writes).toBe(1)
  })
})

describe('selector de espacios · muchos espacios', () => {
  it('con 7 espacios no hay buscador', async () => {
    const all = manySpaces(7)
    mockApi({ 'GET /api/me': { body: inOrg(adminMe, all[0]!, all) } })
    renderShell()
    const menu = await openSwitcher()
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(7)
    expect(screen.queryByRole('searchbox', { name: 'Buscar espacio' })).not.toBeInTheDocument()
  })

  it('con 8 aparece «Buscar espacio», recibe el foco, filtra sin acentos y deja «Tus espacios» a la vista', async () => {
    const all = manySpaces(8)
    all[3] = { ...all[3]!, name: 'Clínica Sonrisa' }
    mockApi({ 'GET /api/me': { body: inOrg(adminMe, all[0]!, all) } })
    renderShell()
    const menu = await openSwitcher()
    const search = screen.getByRole('searchbox', { name: 'Buscar espacio' })
    // El buscador no está dentro del `role="menu"`: las letras son suyas, no de la búsqueda por letra del menú.
    expect(menu).not.toContainElement(search)
    await waitFor(() => expect(search).toHaveFocus())
    await userEvent.keyboard('clinica')
    const found = within(menu).getAllByRole('menuitemradio')
    expect(found).toHaveLength(1)
    expect(found[0]).toHaveAccessibleName('Clínica Sonrisa')
    expect(found[0]).toHaveAccessibleDescription('Agente')
    expect(within(menu).getByRole('menuitem', { name: 'Tus espacios' })).toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.keyboard('zzz')
    expect(within(menu).queryAllByRole('menuitemradio')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('Ningún espacio coincide con tu búsqueda.')
  })

  it('flecha abajo baja del buscador a la lista y Escape borra el texto antes de cerrar', async () => {
    const all = manySpaces(9)
    mockApi({ 'GET /api/me': { body: inOrg(adminMe, all[0]!, all) } })
    renderShell()
    const menu = await openSwitcher()
    const search = screen.getByRole('searchbox', { name: 'Buscar espacio' })
    await waitFor(() => expect(search).toHaveFocus())
    await userEvent.keyboard('espacio')
    await userEvent.keyboard('{Escape}')
    expect(search).toHaveValue('')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}')
    expect(within(menu).getAllByRole('menuitemradio')[0]).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(await card()).toHaveFocus()
  })
})

describe('selector de espacios · cliente', () => {
  const customerIn = (all: OrganizationRef[]) => inOrg(customerMe, all[0]!, all)

  it('con dos espacios solo cambia: sin «Tus espacios» ni «Crear espacio»', async () => {
    const lumen: OrganizationRef = { ...orgC, name: 'Lumen Diseño' }
    mockApi({ 'GET /api/me': { body: customerIn([lumen, orgC]) } })
    renderShell()
    const trigger = await card('Lumen Diseño')
    expect(trigger).toHaveTextContent('Soporte')
    await userEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: 'Cambiar de espacio' })
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(2)
    expect(within(menu).queryByRole('menuitem')).not.toBeInTheDocument()
    expect(within(menu).queryByRole('separator')).not.toBeInTheDocument()
  })

  it('con un solo espacio la tarjeta no abre nada y dice «Soporte»', async () => {
    mockApi({ 'GET /api/me': { body: customerIn([{ ...orgC, name: 'Acme Studio' }]) } })
    renderShell()
    expect(await screen.findByText('Soporte', { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cambiar de espacio/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('Acme Studio').length).toBeGreaterThan(0)
  })
})

describe('selector de espacios · barra colapsada y drawer', () => {
  it('colapsada, el cuadro del espacio es el disparador, con nombre accesible y tooltip también con foco', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell('/tickets', undefined, undefined, 1024)
    const trigger = await card()
    expect(trigger).not.toHaveTextContent('Administrador')
    expect(trigger).toHaveTextContent('AS')
    await userEvent.tab()
    trigger.focus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Acme Studio')
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('menu', { name: 'Cambiar de espacio' })).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('colapsada, el cuadro del espacio lleva el color y conserva el nombre accesible', async () => {
    mockApi({ 'GET /api/me': { body: meInNorthwind } })
    renderShell('/tickets', undefined, undefined, 1024)
    const trigger = await card('Northwind')
    expect(within(trigger).getByText('N')).toHaveAttribute('data-color', 'magenta')
  })

  it('en el drawer, la tarjeta y cada fila de la lista llevan el color de su espacio', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell('/tickets', undefined, undefined, 390)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
    const trigger = await within(drawer).findByRole('button', { name: 'Espacio: Acme Studio. Cambiar de espacio' })
    expect(within(trigger).getByText('AS')).toHaveAttribute('data-color', 'green')
    await userEvent.click(trigger)
    const group = within(drawer).getByRole('group', { name: 'Cambiar de espacio' })
    const row = within(group).getByRole('button', { name: 'Northwind, Agente' })
    expect(row.querySelector('[data-color]')).toHaveAttribute('data-color', 'magenta')
  })

  it('en el drawer el selector se despliega dentro del menú y elegir otro espacio cierra el drawer', async () => {
    mockApi({
      'GET /api/me': { body: meInAcme },
      'POST /api/session/organization': { body: meInNorthwind },
    })
    const { router } = renderShell('/tickets', undefined, undefined, 390)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
    const trigger = await within(drawer).findByRole('button', { name: 'Espacio: Acme Studio. Cambiar de espacio' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const group = within(drawer).getByRole('group', { name: 'Cambiar de espacio' })
    expect(within(group).getByRole('button', { name: 'Acme Studio, Administrador' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(within(group).getByRole('link', { name: 'Tus espacios' })).toHaveAttribute('href', '/configuracion/espacios')
    await userEvent.click(within(group).getByRole('button', { name: 'Northwind, Agente' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menú principal' })).not.toBeInTheDocument())
    expect(document.body).not.toHaveFocus()
  })

  it('en el drawer, elegir el espacio actual cierra la lista y devuelve el foco a la tarjeta', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell('/tickets', undefined, undefined, 390)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
    const trigger = await within(drawer).findByRole('button', { name: 'Espacio: Acme Studio. Cambiar de espacio' })
    await userEvent.click(trigger)
    await userEvent.click(within(drawer).getByRole('button', { name: 'Acme Studio, Administrador' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(within(drawer).queryByRole('group', { name: 'Cambiar de espacio' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(drawer).toBeInTheDocument()
  })

  it('en el drawer, «clinica» encuentra «Clínica»: el filtro no distingue acentos, como el del menú', async () => {
    const all = manySpaces(8)
    all[3] = { ...all[3]!, name: 'Clínica Sonrisa' }
    mockApi({ 'GET /api/me': { body: inOrg(adminMe, all[0]!, all) } })
    renderShell('/tickets', undefined, undefined, 390)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
    await userEvent.click(await within(drawer).findByRole('button', { name: /Cambiar de espacio/ }))
    await userEvent.type(within(drawer).getByRole('searchbox', { name: 'Buscar espacio' }), 'clinica')
    const group = within(drawer).getByRole('group', { name: 'Cambiar de espacio' })
    expect(
      within(group)
        .getAllByRole('button', { name: /, (Administrador|Agente|Cliente)$/ })
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Clínica Sonrisa, Agente'])
  })

  it('en el drawer, desde 8 espacios hay buscador que filtra la lista', async () => {
    const all = manySpaces(8)
    mockApi({ 'GET /api/me': { body: inOrg(adminMe, all[0]!, all) } })
    renderShell('/tickets', undefined, undefined, 390)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
    await userEvent.click(await within(drawer).findByRole('button', { name: /Cambiar de espacio/ }))
    await userEvent.type(within(drawer).getByRole('searchbox', { name: 'Buscar espacio' }), 'Espacio 8')
    const group = within(drawer).getByRole('group', { name: 'Cambiar de espacio' })
    expect(within(group).getAllByRole('button', { name: /, (Administrador|Agente|Cliente)$/ })).toHaveLength(1)
  })

  it('en el drawer, «Crear espacio» abre el diálogo sobre el menú y Escape cierra solo el diálogo', async () => {
    mockApi({ 'GET /api/me': { body: meInAcme } })
    renderShell('/tickets', undefined, undefined, 390)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
    await userEvent.click(await within(drawer).findByRole('button', { name: /Cambiar de espacio/ }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Crear espacio' }))
    const dialog = await screen.findByRole('dialog', { name: 'Crear espacio' })
    expect(within(dialog).getByRole('textbox', { name: 'Nombre del espacio' })).toBeInTheDocument()
    // jsdom no cierra un `<dialog>` con Escape: el navegador lo hace disparando `cancel`.
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crear espacio' })).not.toBeInTheDocument())
    // Los eventos `cancel` y `close` de la hoja suben por el árbol hasta el drawer: no deben cerrarlo también.
    expect(screen.getByRole('dialog', { name: 'Menú principal' })).toHaveAttribute('open')
    expect(document.body).not.toHaveFocus()
  })
})
