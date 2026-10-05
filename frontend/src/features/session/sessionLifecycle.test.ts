import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionKeys } from './queries'
import { clearDrafts, clearSessionData, navigation } from './sessionLifecycle'

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('clearDrafts', () => {
  it('borra los borradores de respuesta y de artículo y deja el resto del almacenamiento', () => {
    sessionStorage.setItem('resolve-draft-1046', 'a')
    sessionStorage.setItem('resolve-article-nuevo', 'b')
    sessionStorage.setItem('resolve-article-recuperar-acceso', 'c')
    sessionStorage.setItem('otra-cosa', 'd')
    clearDrafts()
    expect(Object.keys(sessionStorage)).toEqual(['otra-cosa'])
  })
})

describe('clearSessionData', () => {
  it('cancela lo que está en vuelo, vacía la caché y borra los borradores', async () => {
    const client = new QueryClient()
    sessionStorage.setItem('resolve-draft-1', 'x')
    let aborted = false
    void client
      .fetchQuery({
        queryKey: sessionKeys.me,
        queryFn: ({ signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true
              reject(new Error('cancelada'))
            })
          }),
      })
      .catch(() => {})
    client.setQueryData(['tickets'], [1, 2])
    await clearSessionData(client)
    expect(aborted).toBe(true)
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(sessionStorage.getItem('resolve-draft-1')).toBeNull()
  })
})

describe('navigation.openInNewTab', () => {
  it('abre otra pestaña sin dejar a la nueva el control de esta y sin navegar en esta', () => {
    const opened = { opener: window } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(opened)
    const assign = vi.spyOn(navigation, 'assign')
    navigation.openInNewTab('/api/oauth2/authorization/resolve')
    expect(open).toHaveBeenCalledWith('/api/oauth2/authorization/resolve', '_blank')
    expect(opened.opener).toBeNull()
    expect(assign).not.toHaveBeenCalled()
  })

  it('si el navegador bloquea la ventana, navega en esta como último recurso', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => {})
    navigation.openInNewTab('/api/oauth2/authorization/resolve')
    expect(assign).toHaveBeenCalledWith('/api/oauth2/authorization/resolve')
  })
})
