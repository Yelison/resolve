import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderApp, requestedPaths, staffMes } from '../../test/renderApp'
import { etag, organizationSettings } from './settingsFixtures'

afterEach(() => {
  vi.restoreAllMocks()
})

const settingsApi = (me: object) => ({
  'GET /api/me': { body: me },
  'GET /api/organization': { body: organizationSettings(), headers: etag(3) },
})

const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent)

describe('rutas de configuración', () => {
  it.each(staffMes)('%s: /configuracion abre Empresa y ofrece las cuatro pestañas', async (_role, me) => {
    mockApi(settingsApi(me))
    const router = renderApp('/configuracion')
    expect(await screen.findByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/configuracion/empresa'))
    expect(await screen.findByRole('tab', { name: 'Empresa', selected: true })).toBeInTheDocument()
    expect(tabNames()).toEqual(['Empresa', 'Perfil', 'Apariencia', 'Permisos'])
    expect(screen.queryByText('Vista en construcción')).not.toBeInTheDocument()
  })

  it('mientras /me carga en Perfil se ofrecen solo las pestañas del rol con menos permisos', async () => {
    mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderApp('/configuracion/perfil')
    expect(await screen.findByRole('tab', { name: 'Perfil', selected: true })).toBeInTheDocument()
    expect(tabNames()).toEqual(['Perfil', 'Apariencia'])
  })

  it('un cliente abre Perfil y solo ve Perfil y Apariencia; los ajustes de la empresa no se piden', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': { body: customerMe } })
    const router = renderApp('/configuracion')
    expect(await screen.findByRole('textbox', { name: 'Nombre' })).toHaveValue('María Pérez')
    expect(router.state.location.pathname).toBe('/configuracion/perfil')
    expect(tabNames()).toEqual(['Perfil', 'Apariencia'])
    expect(requestedPaths(fetchSpy)).not.toContain('/api/organization')
  })

  it.each(['/configuracion/empresa', '/configuracion/permisos'])(
    'un cliente que llega por URL a %s ve el aviso sin acceso y no se piden los ajustes',
    async (path) => {
      const fetchSpy = mockApi({ 'GET /api/me': { body: customerMe } })
      renderApp(path)
      expect(await screen.findByText('No tienes acceso a esta sección')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Permisos por rol' })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Nombre del espacio' })).not.toBeInTheDocument()
      // Ninguna pestaña queda marcada sobre un contenido que no es el suyo: el aviso va fuera de las pestañas.
      expect(screen.queryAllByRole('tab')).toHaveLength(0)
      expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ir a tu perfil' })).toHaveAttribute('href', '/configuracion/perfil')
      expect(requestedPaths(fetchSpy)).not.toContain('/api/organization')
    },
  )

  it('mientras /me carga en una pestaña del personal no se marca ninguna pestaña ni se pide la organización', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderApp('/configuracion/empresa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Configuración' })).toBeInTheDocument()
    // Con una pestaña de personal en la URL y el rol sin conocer, no se marca ninguna otra: esqueleto sin pestañas.
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
    expect(screen.getByText('Cargando los ajustes de la empresa…')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Nombre del espacio' })).not.toBeInTheDocument()
    expect(requestedPaths(fetchSpy)).not.toContain('/api/organization')
  })

  it.each(staffMes)(
    '%s: /configuracion/permisos muestra la matriz, no la vista pendiente ni un 404',
    async (_role, me) => {
      mockApi(settingsApi(me))
      renderApp('/configuracion/permisos')
      expect(await screen.findByRole('table')).toBeInTheDocument()
      expect(screen.getByText('Los permisos se validan también en el servidor')).toBeInTheDocument()
      expect(screen.queryByText('Vista en construcción')).not.toBeInTheDocument()
      expect(screen.queryByText('Página no encontrada')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Permisos' })).toHaveAttribute('aria-selected', 'true')
    },
  )

  it('/configuracion/roles redirige a permisos', async () => {
    mockApi(settingsApi(adminMe))
    const router = renderApp('/configuracion/roles')
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/configuracion/permisos')
  })

  it('cambiar de pestaña cambia la URL y, con las flechas, el foco se queda en la pestaña', async () => {
    mockApi(settingsApi(adminMe))
    const router = renderApp('/configuracion/empresa')
    await screen.findByRole('textbox', { name: 'Nombre del espacio' })
    await userEvent.click(screen.getByRole('tab', { name: 'Empresa' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(router.state.location.pathname).toBe('/configuracion/perfil')
    await vi.waitFor(() => expect(screen.getByRole('tab', { name: 'Perfil' })).toHaveFocus())
    await userEvent.keyboard('{End}')
    expect(router.state.location.pathname).toBe('/configuracion/permisos')
    await vi.waitFor(() => expect(screen.getByRole('tab', { name: 'Permisos' })).toHaveFocus())
    await userEvent.click(screen.getByRole('tab', { name: 'Apariencia' }))
    expect(router.state.location.pathname).toBe('/configuracion/apariencia')
    expect(await screen.findByRole('group', { name: 'Tema' })).toBeInTheDocument()
  })

  it('el sidebar muestra el nombre nuevo del espacio al guardar la organización', async () => {
    let name = 'Acme Studio'
    mockApi({
      'GET /api/me': () => ({ body: { ...adminMe, organization: { ...adminMe.organization, name } } }),
      'GET /api/organization': () => ({ body: organizationSettings({ name }), headers: etag(3) }),
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
