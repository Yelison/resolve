import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminMe, mockApi } from '../../test/api'
import { navigation } from './sessionLifecycle'
import { renderShell, setCsrfCookie, stubProductionBuild } from './shellHarness'

const orgA = { id: '0192f000-0000-7000-8000-000000000001', name: 'Acme Studio' }
const orgB = { id: '0192f000-0000-7000-8000-000000000002', name: 'Northwind' }
const meWithOrganizations = {
  ...adminMe,
  organization: { ...adminMe.organization, ...orgA },
  organizations: [orgA, orgB],
}
const meInNorthwind = {
  ...meWithOrganizations,
  organization: { ...adminMe.organization, id: orgB.id, name: orgB.name },
}

const accountButton = () => screen.findByRole('button', { name: 'Cuenta: Yelisson Ortiz, Acme Studio' })

async function openAccountMenu() {
  await userEvent.click(await accountButton())
  return screen.getByRole('menu', { name: 'Cuenta' })
}

const requests = (spy: ReturnType<typeof mockApi>) => spy.mock.calls.map(([input]) => input as Request)

beforeEach(() => {
  sessionStorage.clear()
  setCsrfCookie('token-1')
  vi.spyOn(navigation, 'assign').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  sessionStorage.clear()
  setCsrfCookie(null)
})

describe('menú de la cuenta', () => {
  it('mientras /me carga el avatar no ofrece ninguna acción de cuenta', async () => {
    mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderShell()
    expect(await screen.findByRole('banner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cuenta/ })).not.toBeInTheDocument()
  })

  it('con una sola organización ofrece solo cerrar sesión', async () => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    renderShell()
    const menu = await openAccountMenu()
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Cerrar sesión'])
  })

  describe('cerrar sesión', () => {
    it('pide /logout con el token CSRF, vacía la caché y los borradores y navega al proveedor', async () => {
      const spy = mockApi({
        'GET /api/me': { body: adminMe },
        'POST /api/logout': { body: { logoutUrl: 'https://idp.example/logout?id_token_hint=abc' } },
      })
      sessionStorage.setItem('resolve-draft-1046', 'Respuesta a medias')
      sessionStorage.setItem('resolve-article-nuevo', '{"title":"Borrador"}')
      sessionStorage.setItem('otra-cosa', 'se queda')
      const { queryClient } = renderShell()
      await userEvent.click(within(await openAccountMenu()).getByRole('menuitem', { name: 'Cerrar sesión' }))

      await waitFor(() =>
        expect(navigation.assign).toHaveBeenCalledWith('https://idp.example/logout?id_token_hint=abc'),
      )
      const logout = requests(spy).find((request) => request.url.endsWith('/api/logout'))!
      expect(logout.method).toBe('POST')
      expect(logout.headers.get('X-XSRF-TOKEN')).toBe('token-1')
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
      expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
      expect(sessionStorage.getItem('resolve-article-nuevo')).toBeNull()
      expect(sessionStorage.getItem('otra-cosa')).toBe('se queda')
    })

    it('no da la sesión por cerrada hasta que responde: sin navegar mientras la petición está en vuelo', async () => {
      let answer: (() => void) | undefined
      mockApi({
        'GET /api/me': { body: adminMe },
        'POST /api/logout': () =>
          new Promise((resolve) => {
            answer = () => resolve({ body: { logoutUrl: 'https://idp.example/logout' } })
          }),
      })
      renderShell()
      await userEvent.click(within(await openAccountMenu()).getByRole('menuitem', { name: 'Cerrar sesión' }))
      await waitFor(() => expect(answer).toBeDefined())
      expect(navigation.assign).not.toHaveBeenCalled()
      answer!()
      await waitFor(() => expect(navigation.assign).toHaveBeenCalledOnce())
    })

    it('si falla, la sesión sigue abierta, se avisa y no se navega', async () => {
      mockApi({
        'GET /api/me': { body: adminMe },
        'POST /api/logout': { status: 500, body: { status: 500, title: 'Error interno' } },
      })
      const { queryClient } = renderShell()
      await userEvent.click(within(await openAccountMenu()).getByRole('menuitem', { name: 'Cerrar sesión' }))
      const region = screen.getByRole('region', { name: 'Notificaciones' })
      expect(await within(region).findByText('No pudimos cerrar la sesión')).toBeInTheDocument()
      expect(navigation.assign).not.toHaveBeenCalled()
      expect(queryClient.getQueryData(['session', 'me'])).toBeDefined()
      await expect(accountButton()).resolves.toHaveFocus()
    })
  })

  describe('cambiar de organización', () => {
    it('solo se ofrece con más de una organización', async () => {
      mockApi({ 'GET /api/me': { body: meWithOrganizations } })
      renderShell()
      const menu = await openAccountMenu()
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual(['Cambiar de organización · Acme Studio', 'Cerrar sesión'])
    })

    it('envía la elección, vacía la caché y los borradores, muestra el Me nuevo y vuelve al resumen', async () => {
      const spy = mockApi({
        'GET /api/me': { body: meWithOrganizations },
        'POST /api/session/organization': { body: meInNorthwind },
      })
      sessionStorage.setItem('resolve-draft-1046', 'Borrador de la otra organización')
      const { queryClient, router } = renderShell('/tickets/1046')
      queryClient.setQueryData(['tickets', 'detail', 1046], { subject: 'Ticket de Acme' })
      await userEvent.click(within(await openAccountMenu()).getByRole('menuitem', { name: /Cambiar de organización/ }))

      const dialog = screen.getByRole('dialog', { name: 'Cambiar de organización' })
      expect(within(dialog).getByRole('radio', { name: 'Acme Studio (actual)' })).toBeChecked()
      expect(within(dialog).getByRole('button', { name: 'Cambiar de organización' })).toBeDisabled()
      await userEvent.click(within(dialog).getByRole('radio', { name: 'Northwind' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cambiar de organización' }))

      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
      const post = requests(spy).find((request) => request.url.endsWith('/api/session/organization'))!
      expect(post.headers.get('X-XSRF-TOKEN')).toBe('token-1')
      await expect(post.clone().json()).resolves.toEqual({ organizationId: orgB.id })
      expect(queryClient.getQueryData(['tickets', 'detail', 1046])).toBeUndefined()
      expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
      expect(await screen.findByRole('button', { name: 'Cuenta: Yelisson Ortiz, Northwind' })).toBeInTheDocument()
      const region = screen.getByRole('region', { name: 'Notificaciones' })
      expect(await within(region).findByText('Ahora trabajas en Northwind')).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Cambiar de organización' })).not.toBeInTheDocument()
      expect(document.body).not.toHaveFocus()
    })

    it('un 403 muestra el error en el diálogo, que sigue abierto, y relee la sesión', async () => {
      let meReads = 0
      mockApi({
        'GET /api/me': () => {
          meReads += 1
          return { body: meWithOrganizations }
        },
        'POST /api/session/organization': {
          status: 403,
          body: { status: 403, title: 'Sin permiso', detail: 'Tu rol no permite esta acción.' },
        },
      })
      renderShell()
      await userEvent.click(within(await openAccountMenu()).getByRole('menuitem', { name: /Cambiar de organización/ }))
      const dialog = screen.getByRole('dialog', { name: 'Cambiar de organización' })
      await userEvent.click(within(dialog).getByRole('radio', { name: 'Northwind' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cambiar de organización' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ya no tienes acceso a esa organización.')
      expect(within(dialog).getByRole('radio', { name: 'Northwind' })).toBeChecked()
      await waitFor(() => expect(meReads).toBe(2))
    })

    it('un 401 dice que la sesión caducó en lugar de culpar a la conexión', async () => {
      mockApi({
        'GET /api/me': { body: meWithOrganizations },
        'POST /api/session/organization': { status: 401, body: { status: 401, title: 'No autenticado' } },
      })
      renderShell()
      await userEvent.click(within(await openAccountMenu()).getByRole('menuitem', { name: /Cambiar de organización/ }))
      const dialog = screen.getByRole('dialog', { name: 'Cambiar de organización' })
      await userEvent.click(within(dialog).getByRole('radio', { name: 'Northwind' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cambiar de organización' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tu sesión caducó. Vuelve a entrar')
      const region = screen.getByRole('region', { name: 'Notificaciones' })
      expect(within(region).getByText('Tu sesión caducó')).toBeInTheDocument()
    })

    it('cancelar devuelve el foco al botón de la cuenta', async () => {
      mockApi({ 'GET /api/me': { body: meWithOrganizations } })
      renderShell()
      await userEvent.click(within(await openAccountMenu()).getByRole('menuitem', { name: /Cambiar de organización/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(await accountButton()).toHaveFocus()
    })
  })

  describe('usuario de demostración', () => {
    it('en desarrollo y sin sesión OIDC ofrece el selector en lugar de cerrar sesión', async () => {
      setCsrfCookie(null)
      mockApi({ 'GET /api/me': { body: adminMe } })
      renderShell()
      const menu = await openAccountMenu()
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual(['Cambiar usuario de demostración'])
    })

    it('cambia de usuario sin mezclar la caché del anterior', async () => {
      setCsrfCookie(null)
      mockApi({ 'GET /api/me': { body: adminMe } })
      const { queryClient, router } = renderShell('/tickets')
      queryClient.setQueryData(['tickets', 'list'], { items: ['de Yelisson'] })
      await userEvent.click(within(await openAccountMenu()).getByRole('menuitem', { name: /usuario de demostración/ }))
      const dialog = screen.getByRole('dialog', { name: 'Cambiar de usuario de demostración' })
      await userEvent.selectOptions(
        within(dialog).getByRole('combobox', { name: 'Usuario de demostración' }),
        'maria.perez@cliente.example',
      )
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cambiar de usuario' }))
      await waitFor(() => expect(localStorage.getItem('resolve-demo-user')).toBe('maria.perez@cliente.example'))
      expect(queryClient.getQueryData(['tickets', 'list'])).toBeUndefined()
      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    })

    it('con cookie CSRF (hay sesión OIDC) ofrece cerrar sesión, no el selector', async () => {
      mockApi({ 'GET /api/me': { body: adminMe } })
      renderShell()
      const menu = await openAccountMenu()
      expect(within(menu).queryByRole('menuitem', { name: /demostración/ })).not.toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Cerrar sesión' })).toBeInTheDocument()
    })

    it('en el build de producción nunca aparece el selector, ni sin cookie', async () => {
      stubProductionBuild()
      setCsrfCookie(null)
      mockApi({ 'GET /api/me': { body: adminMe } })
      renderShell()
      const menu = await openAccountMenu()
      expect(within(menu).queryByRole('menuitem', { name: /demostración/ })).not.toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Cerrar sesión' })).toBeInTheDocument()
    })
  })
})
