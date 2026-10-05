import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNAUTHORIZED_EVENT, api } from '../../api/client'
import { adminMe, mockApi } from '../../test/api'
import { LOGIN_PATH, navigation, sessionState } from './sessionLifecycle'
import { renderShell, setCsrfCookie } from './shellHarness'

const region = () => screen.getByRole('region', { name: 'Notificaciones' })
const unauthorized = (method = 'POST', path = '/tickets/1046/messages') =>
  act(() => {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { method, path } }))
  })

beforeEach(() => {
  setCsrfCookie('token-1')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  sessionState.ending = false
  setCsrfCookie(null)
})

describe('aviso «Tu sesión caducó»', () => {
  it('una escritura con 401 muestra el aviso persistente con «Volver a entrar», sin salir de la pantalla', async () => {
    mockApi({
      'GET /api/me': { body: adminMe },
      'POST /api/session/organization': { status: 401, body: { status: 401, title: 'No autenticado' } },
    })
    const { router } = renderShell('/tickets/1046')
    await screen.findByRole('button', { name: /^Cuenta/ })
    await api.POST('/session/organization', { body: { organizationId: 'x' } })

    expect(await within(region()).findByText('Tu sesión caducó')).toBeInTheDocument()
    expect(within(region()).getByRole('button', { name: 'Volver a entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/tickets/1046')
  })

  it('persiste: sigue en pantalla mucho después de la duración de un toast normal', async () => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    renderShell()
    await screen.findByRole('button', { name: /^Cuenta/ })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    unauthorized()
    expect(within(region()).getByText('Tu sesión caducó')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(60 * 60 * 1000))
    expect(within(region()).getByText('Tu sesión caducó')).toBeInTheDocument()
  })

  it('«Volver a entrar» abre el inicio de sesión en otra pestaña para no perder lo escrito', async () => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    const open = vi.spyOn(navigation, 'openInNewTab').mockImplementation(() => {})
    renderShell()
    await screen.findByRole('button', { name: /^Cuenta/ })
    unauthorized()
    await userEvent.click(within(region()).getByRole('button', { name: 'Volver a entrar' }))
    expect(open).toHaveBeenCalledWith(LOGIN_PATH)
  })

  it('varios 401 seguidos dan un solo aviso', async () => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    renderShell()
    await screen.findByRole('button', { name: /^Cuenta/ })
    unauthorized()
    unauthorized('GET', '/tickets')
    unauthorized('PATCH', '/tickets/1046')
    expect(within(region()).getAllByText('Tu sesión caducó')).toHaveLength(1)
  })

  it('sin sesión cargada (el primer /me) no avisa de que caducó', async () => {
    mockApi({ 'GET /api/me': () => new Promise(() => {}) as never })
    renderShell()
    await screen.findByRole('banner')
    unauthorized('GET', '/me')
    expect(within(region()).queryByText('Tu sesión caducó')).not.toBeInTheDocument()
  })

  it('mientras se cierra la sesión el 401 es esperado y no avisa', async () => {
    mockApi({ 'GET /api/me': { body: adminMe } })
    renderShell()
    await screen.findByRole('button', { name: /^Cuenta/ })
    sessionState.ending = true
    unauthorized()
    expect(within(region()).queryByText('Tu sesión caducó')).not.toBeInTheDocument()
  })

  it('al volver a esta pestaña con la sesión restablecida, el aviso se retira solo', async () => {
    let signedIn = true
    mockApi({
      'GET /api/me': () =>
        signedIn ? { body: adminMe } : { status: 401, body: { status: 401, title: 'No autenticado' } },
    })
    renderShell()
    await screen.findByRole('button', { name: /^Cuenta/ })
    signedIn = false
    unauthorized()
    expect(within(region()).getByText('Tu sesión caducó')).toBeInTheDocument()

    // Sigue sin sesión: el aviso se queda.
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(within(region()).getByText('Tu sesión caducó')).toBeInTheDocument()

    signedIn = true
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(within(region()).queryByText('Tu sesión caducó')).not.toBeInTheDocument())
  })

  describe('al volver a entrar', () => {
    const northwindMe = {
      ...adminMe,
      organization: { ...adminMe.organization, id: 'org-2', name: 'Northwind' },
    }
    const jordiMe = { ...adminMe, user: { id: 'u-jordi', name: 'Jordi Puig', email: 'jordi@northwind.example' } }

    /** Caduca la sesión con datos de la sesión anterior en caché y un borrador escrito; devuelve lo necesario para volver a entrar. */
    async function expireWith(returnedMe: typeof adminMe) {
      let current = adminMe
      let expired = false
      mockApi({
        'GET /api/me': () =>
          expired ? { status: 401, body: { status: 401, title: 'No autenticado' } } : { body: current },
      })
      vi.spyOn(navigation, 'openInNewTab').mockImplementation(() => {})
      sessionStorage.setItem('resolve-draft-1046', 'Respuesta a medias')
      const rendered = renderShell('/tickets/1046')
      await screen.findByRole('button', { name: /^Cuenta/ })
      rendered.queryClient.setQueryData(['tickets', 'detail', 1046], { subject: 'Ticket de la sesión anterior' })
      expired = true
      unauthorized()
      await userEvent.click(within(region()).getByRole('button', { name: 'Volver a entrar' }))
      return {
        ...rendered,
        signIn: () => {
          expired = false
          current = returnedMe
          act(() => {
            window.dispatchEvent(new Event('focus'))
          })
        },
      }
    }

    afterEach(() => sessionStorage.clear())

    it('con la misma persona y organización conserva la caché y el borrador y devuelve el foco', async () => {
      const { signIn, queryClient, router } = await expireWith(adminMe)
      signIn()
      await waitFor(() => expect(within(region()).queryByText('Tu sesión caducó')).not.toBeInTheDocument())
      expect(queryClient.getQueryData(['tickets', 'detail', 1046])).toBeDefined()
      expect(sessionStorage.getItem('resolve-draft-1046')).toBe('Respuesta a medias')
      expect(router.state.location.pathname).toBe('/tickets/1046')
      // El botón del aviso desapareció con el foco: no puede quedar en body.
      await waitFor(() => expect(document.body).not.toHaveFocus())
    })

    it('devuelve el foco al elemento que lo tenía cuando avisó', async () => {
      mockApi({ 'GET /api/me': { body: adminMe } })
      vi.spyOn(navigation, 'openInNewTab').mockImplementation(() => {})
      renderShell()
      const button = await screen.findByRole('button', { name: /^Cuenta/ })
      button.focus()
      unauthorized()
      await userEvent.click(within(region()).getByRole('button', { name: 'Volver a entrar' }))
      act(() => {
        window.dispatchEvent(new Event('focus'))
      })
      await waitFor(() => expect(within(region()).queryByText('Tu sesión caducó')).not.toBeInTheDocument())
      await waitFor(() => expect(button).toHaveFocus())
    })

    it('si quien tenía el foco ya no existe, lo recibe el título de la página', async () => {
      mockApi({ 'GET /api/me': { body: adminMe } })
      vi.spyOn(navigation, 'openInNewTab').mockImplementation(() => {})
      renderShell()
      await screen.findByRole('button', { name: /^Cuenta/ })
      ;(document.activeElement as HTMLElement | null)?.blur()
      unauthorized()
      await userEvent.click(within(region()).getByRole('button', { name: 'Volver a entrar' }))
      act(() => {
        window.dispatchEvent(new Event('focus'))
      })
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Ticket' })).toHaveFocus())
    })

    it.each([
      ['otra organización', northwindMe, 'Entraste como Yelisson Ortiz en Northwind'],
      ['otra persona', jordiMe, 'Entraste como Jordi Puig en Acme Studio'],
    ])('si entra %s descarta la caché y el borrador y vuelve al resumen', async (_case, returned, title) => {
      const { signIn, queryClient, router } = await expireWith(returned)
      signIn()
      expect(await within(region()).findByText(title)).toBeInTheDocument()
      expect(queryClient.getQueryData(['tickets', 'detail', 1046])).toBeUndefined()
      expect(sessionStorage.getItem('resolve-draft-1046')).toBeNull()
      expect(router.state.location.pathname).toBe('/')
      expect(within(region()).queryByText('Tu sesión caducó')).not.toBeInTheDocument()
      expect(queryClient.getQueryData<typeof adminMe>(['session', 'me'])?.organization.name).toBe(
        returned.organization.name,
      )
    })
  })
})
