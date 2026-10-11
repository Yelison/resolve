import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderApp, requestedPaths, staffMes } from '../../test/renderApp'
import { THEME_STORAGE_KEY } from '../../app/theme/theme'
import { metrics } from '../../test/ticketFixtures'
import { etag, organizationSettings } from './settingsFixtures'
import { mockViewport } from './viewportTesting'

afterEach(() => {
  vi.restoreAllMocks()
})

const settingsApi = (me: object) => ({
  'GET /api/me': { body: me },
  'GET /api/organization': { body: organizationSettings(), headers: etag(3) },
  'GET /api/tickets/metrics': { body: metrics },
})

const sectionLinks = () =>
  within(screen.getByRole('navigation', { name: 'Secciones de configuración' })).getAllByRole('link')
const linkNames = () => sectionLinks().map((link) => link.querySelector('span')?.textContent ?? link.textContent)

describe('rutas de configuración (desde 768 px)', () => {
  beforeEach(() => {
    mockViewport(1440)
  })

  it.each(staffMes)('%s: /configuracion abre Empresa y ofrece sus tres secciones en dos grupos', async (_role, me) => {
    mockApi(settingsApi(me))
    const router = renderApp('/configuracion')
    expect(await screen.findByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/configuracion/empresa'))
    expect(await screen.findByRole('heading', { level: 2, name: 'Identidad' })).toBeInTheDocument()
    expect(linkNames()).toEqual(['Empresa', 'Permisos', 'General'])
    expect(screen.getByRole('link', { name: /^Empresa/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /^General/ })).not.toHaveAttribute('aria-current')
    const groups = screen.getAllByRole('list', { name: /Espacio|Tu cuenta/ })
    expect(groups.map((group) => within(group).getAllByRole('link').length)).toEqual([2, 1])
    expect(screen.getByRole('link', { name: /Nombre, soporte y objetivos/ })).toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('mientras /me carga en General solo se ofrece la sección del rol con menos permisos', async () => {
    mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderApp('/configuracion/general')
    expect(await screen.findByRole('link', { name: /^General/ })).toHaveAttribute('aria-current', 'page')
    expect(linkNames()).toEqual(['General'])
  })

  it('un cliente abre General y solo ve «Tu cuenta › General»; ni los ajustes ni las métricas se piden', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': { body: customerMe } })
    const router = renderApp('/configuracion')
    expect(await screen.findByRole('textbox', { name: 'Nombre' })).toHaveValue('María Pérez')
    expect(router.state.location.pathname).toBe('/configuracion/general')
    expect(linkNames()).toEqual(['General'])
    expect(screen.queryByText('Espacio')).not.toBeInTheDocument()
    expect(screen.getByText('Tu cuenta')).toBeInTheDocument()
    expect(requestedPaths(fetchSpy)).not.toContain('/api/organization')
    expect(requestedPaths(fetchSpy)).not.toContain('/api/tickets/metrics')
  })

  it.each(['/configuracion/empresa', '/configuracion/permisos'])(
    'un cliente que llega por URL a %s ve el aviso sin acceso y no se piden los ajustes ni las métricas',
    async (path) => {
      const fetchSpy = mockApi({ 'GET /api/me': { body: customerMe } })
      renderApp(path)
      expect(await screen.findByText('No tienes acceso a esta sección')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Permisos por rol' })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Nombre del espacio' })).not.toBeInTheDocument()
      // Ningún enlace queda marcado sobre un contenido que no es el suyo.
      expect(sectionLinks().filter((link) => link.hasAttribute('aria-current'))).toHaveLength(0)
      expect(screen.getByRole('link', { name: 'Ir a General' })).toHaveAttribute('href', '/configuracion/general')
      expect(requestedPaths(fetchSpy)).not.toContain('/api/organization')
      expect(requestedPaths(fetchSpy)).not.toContain('/api/tickets/metrics')
    },
  )

  it('mientras /me carga en una sección del personal no se marca ninguna ni se pide la organización', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderApp('/configuracion/empresa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument()
    expect(screen.getByText('Cargando los ajustes de la empresa…')).toBeInTheDocument()
    expect(sectionLinks().filter((link) => link.hasAttribute('aria-current'))).toHaveLength(0)
    expect(screen.queryByRole('textbox', { name: 'Nombre del espacio' })).not.toBeInTheDocument()
    expect(requestedPaths(fetchSpy)).not.toContain('/api/organization')
    expect(requestedPaths(fetchSpy)).not.toContain('/api/tickets/metrics')
  })

  it.each(staffMes)(
    '%s: /configuracion/permisos muestra los permisos, no la vista pendiente ni un 404',
    async (_role, me) => {
      mockApi(settingsApi(me))
      renderApp('/configuracion/permisos')
      expect(await screen.findByRole('heading', { level: 2, name: 'Permisos por rol' })).toBeInTheDocument()
      expect(screen.queryByText(/servidor/)).not.toBeInTheDocument()
      expect(screen.queryByText('Página no encontrada')).not.toBeInTheDocument()
      expect(await screen.findByRole('link', { name: /^Permisos/ })).toHaveAttribute('aria-current', 'page')
    },
  )

  it.each([
    ['/configuracion/perfil', '/configuracion/general'],
    ['/configuracion/apariencia', '/configuracion/general'],
    ['/configuracion/roles', '/configuracion/permisos'],
  ])('%s redirige a %s sin dejar la ruta antigua en el historial', async (from, to) => {
    mockApi(settingsApi(adminMe))
    const router = renderApp(from)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe(to))
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('elegir una sección cambia la URL como navegación normal y Atrás vuelve a la anterior', async () => {
    mockApi(settingsApi(adminMe))
    const router = renderApp('/configuracion/empresa')
    await screen.findByRole('textbox', { name: 'Nombre del espacio' })
    await userEvent.click(screen.getByRole('link', { name: /^Permisos/ }))
    expect(router.state.location.pathname).toBe('/configuracion/permisos')
    await userEvent.click(screen.getByRole('link', { name: /^General/ }))
    expect(router.state.location.pathname).toBe('/configuracion/general')
    expect(await screen.findByRole('group', { name: 'Tema' })).toBeInTheDocument()
    await router.navigate(-1)
    expect(router.state.location.pathname).toBe('/configuracion/permisos')
  })
})

describe('rutas de configuración (por debajo de 768 px)', () => {
  beforeEach(() => {
    mockViewport(390)
  })

  it('/configuracion es la lista de secciones, con el estado de General, y no redirige', async () => {
    mockApi(settingsApi(adminMe))
    const router = renderApp('/configuracion')
    expect(await screen.findByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument()
    expect(await screen.findByText('Yelisson Ortiz · tema como el sistema')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/configuracion')
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Espacio',
      'Tu cuenta',
    ])
    expect(screen.getByRole('link', { name: /^Permisos/ })).toHaveAttribute('href', '/configuracion/permisos')
  })

  it('el estado de General sigue al tema elegido', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    mockApi(settingsApi(adminMe))
    renderApp('/configuracion')
    expect(await screen.findByText('Yelisson Ortiz · tema oscuro')).toBeInTheDocument()
    localStorage.clear()
  })

  it('a un cliente le muestra solo «Tu cuenta»', async () => {
    mockApi({ 'GET /api/me': { body: customerMe } })
    renderApp('/configuracion')
    expect(await screen.findByText('María Pérez · tema como el sistema')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Empresa/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Espacio')).not.toBeInTheDocument()
  })

  it('cada sección es una pantalla con «‹ Configuración» y su título como h1', async () => {
    mockApi(settingsApi(adminMe))
    const router = renderApp('/configuracion/empresa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Empresa' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Secciones de configuración' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Configuración' }))
    expect(router.state.location.pathname).toBe('/configuracion')
    expect(await screen.findByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument()
  })

  it('un cliente que llega a una sección del personal ve el aviso y vuelve a General', async () => {
    mockApi({ 'GET /api/me': { body: customerMe } })
    renderApp('/configuracion/empresa')
    expect(await screen.findByText('No tienes acceso a esta sección')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a General' })).toBeInTheDocument()
  })

  it('/configuracion/permisos usa el selector de rol y el h1 «Permisos»', async () => {
    mockApi(settingsApi(adminMe))
    renderApp('/configuracion/permisos')
    expect(await screen.findByRole('heading', { level: 1, name: 'Permisos' })).toBeInTheDocument()
    expect(await screen.findByRole('group', { name: 'Rol' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('cambio de ancho', () => {
  it('al ensanchar la ventana desde la lista se abre la primera sección del rol', async () => {
    mockApi(settingsApi(adminMe))
    const viewport = mockViewport(390)
    const router = renderApp('/configuracion')
    expect(await screen.findByText('Yelisson Ortiz · tema como el sistema')).toBeInTheDocument()
    viewport.mockRestore()
    // La lista no se queda en pantalla ancha: el índice abre Empresa al renderizar de nuevo.
    mockViewport(1440)
    router.navigate('/configuracion/empresa')
    expect(await screen.findByRole('textbox', { name: 'Nombre del espacio' })).toBeInTheDocument()
  })
})

describe('rutas de configuración: datos', () => {
  it('el sidebar muestra el nombre nuevo del espacio al guardar la organización', async () => {
    let name = 'Acme Studio'
    mockApi({
      'GET /api/me': () => ({ body: { ...adminMe, organization: { ...adminMe.organization, name } } }),
      'GET /api/organization': () => ({ body: organizationSettings({ name }), headers: etag(3) }),
      'GET /api/tickets/metrics': { body: metrics },
      'PATCH /api/organization': () => {
        name = 'Acme Studio SL'
        return { body: organizationSettings({ name, version: 4 }), headers: etag(4) }
      },
    })
    renderApp('/configuracion/empresa')
    const input = await screen.findByRole('textbox', { name: 'Nombre del espacio' })
    const workspaceName = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
      const drawer = screen.getByRole('dialog', { name: 'Menú principal' })
      const text = within(drawer).getByText('Espacio de trabajo').previousElementSibling?.textContent
      await userEvent.keyboard('{Escape}')
      return text
    }
    expect(await workspaceName()).toBe('Acme Studio')
    await userEvent.clear(input)
    await userEvent.type(input, 'Acme Studio SL')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByText('Cambios guardados')
    expect(await workspaceName()).toBe('Acme Studio SL')
  })

  it('el agente ve Empresa en solo lectura', async () => {
    mockApi(settingsApi({ ...adminMe, role: 'agent' }))
    renderApp('/configuracion/empresa')
    expect(await screen.findByText('Acme Studio', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })
})
