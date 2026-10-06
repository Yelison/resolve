import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionKeys } from './queries'
import {
  cancelFocusContent,
  clearDrafts,
  clearSessionData,
  focusContentWhenReady,
  navigation,
} from './sessionLifecycle'

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

describe('focusContentWhenReady', () => {
  function page() {
    document.body.innerHTML = '<main id="contenido" tabindex="-1"></main><button id="otro">Otro</button>'
    return { main: document.getElementById('contenido')!, other: document.getElementById('otro')! }
  }

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('lleva el foco al contenido y lo confirma poco después', () => {
    vi.useFakeTimers()
    const { main } = page()
    focusContentWhenReady()
    vi.advanceTimersByTime(0)
    expect(main).toHaveFocus()
    vi.advanceTimersByTime(100)
    expect(main).toHaveFocus()
  })

  it('si se lo quitan (cae en body, como al devolverlo el diálogo a un disparador que ya no existe) lo recupera', () => {
    vi.useFakeTimers()
    const { main } = page()
    focusContentWhenReady()
    vi.advanceTimersByTime(0)
    main.blur()
    vi.advanceTimersByTime(100)
    expect(main).toHaveFocus()
  })

  it('si la persona ya lo movió a otro elemento, no se lo quita', () => {
    vi.useFakeTimers()
    const { main, other } = page()
    focusContentWhenReady()
    vi.advanceTimersByTime(0)
    expect(main).toHaveFocus()
    other.focus()
    vi.advanceTimersByTime(100)
    expect(other).toHaveFocus()
  })

  it('espera a que se cierre un diálogo modal abierto', () => {
    vi.useFakeTimers()
    const { main } = page()
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)
    focusContentWhenReady()
    vi.advanceTimersByTime(120)
    expect(main).not.toHaveFocus()
    dialog.removeAttribute('open')
    vi.advanceTimersByTime(60)
    expect(main).toHaveFocus()
  })

  it('devuelve su cancelación: sin #contenido sigue reintentando y, al cancelar, no queda ningún temporizador', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<button id="otro">Otro</button>' // sin #contenido: la cadena reintenta
    const getById = vi.spyOn(document, 'getElementById')
    const cancel = focusContentWhenReady()
    vi.advanceTimersByTime(500)
    expect(getById.mock.calls.length).toBeGreaterThan(3)
    expect(vi.getTimerCount()).toBe(1)

    cancel()
    expect(vi.getTimerCount()).toBe(0)
    const calls = getById.mock.calls.length
    vi.advanceTimersByTime(3_000)
    expect(getById.mock.calls.length).toBe(calls)
  })

  it('cancelFocusContent corta la cadena en curso y una llamada nueva sustituye a la anterior', () => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    focusContentWhenReady()
    focusContentWhenReady() // una sola cadena a la vez
    expect(vi.getTimerCount()).toBe(1)
    cancelFocusContent()
    expect(vi.getTimerCount()).toBe(0)
    cancelFocusContent() // sin cadena en curso no hace nada
  })

  it('si el documento ya no existe cuando salta el temporizador, no lanza (una prueba terminada)', () => {
    vi.useFakeTimers()
    focusContentWhenReady()
    vi.stubGlobal('document', undefined)
    try {
      expect(() => vi.advanceTimersByTime(60)).not.toThrow()
      expect(vi.getTimerCount()).toBe(0) // y la cadena termina, no sigue reintentando
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
