import { createMemoryRouter, RouterProvider } from 'react-router'
import type { QueryClient } from '@tanstack/react-query'
import { act } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { AppShell } from '../../app/layout/AppShell'
import { renderWithProviders } from '../../test/render'
import type { SessionMessageType } from './sessionChannel'

const originalMatchMedia = window.matchMedia
// El ancho simulado no pasa de un test al siguiente: tras cada uno vuelve el `matchMedia` de la configuración.
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

/**
 * Ancho de escritorio para la shell: el perfil con el menú de la cuenta vive en el sidebar, que por debajo de 768 px
 * está en un drawer cerrado. jsdom no tiene viewport, así que las media queries de ancho mínimo se resuelven contra 1280 px.
 */
export function stubViewportWidth(width = 1280) {
  window.matchMedia = (query: string) => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query)
    return {
      matches: min !== null && Number(min[1]) <= width,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList
  }
}

/** Estado de un test de sesión: la shell real con unas pocas rutas y la pantalla de entrada. */
export function renderShell(
  path = '/tickets/1046',
  /** Si se da, la ruta `/` es perezosa y no se carga hasta que se resuelve esta promesa (el router espera antes de desmontar la pantalla anterior). */
  lazyHome?: Promise<void>,
  /** El cliente de consultas, si el test necesita la política de reintentos real y no la de los tests (`retry: false`). */
  queryClient?: QueryClient,
  /** Ancho simulado del viewport: 1280 (escritorio), 1024 (menú de iconos) o 390 (drawer). */
  width = 1280,
) {
  stubViewportWidth(width)
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          lazyHome
            ? {
                index: true,
                lazy: async () => {
                  await lazyHome
                  return { Component: () => <h1>Resumen</h1> }
                },
                handle: { crumb: 'Resumen' },
              }
            : { index: true, element: <h1>Resumen</h1>, handle: { crumb: 'Resumen' } },
          { path: 'tickets', element: <h1>Tickets</h1>, handle: { crumb: 'Tickets' } },
          { path: 'tickets/:number', element: <h1>Ticket</h1>, handle: { crumb: 'Ticket' } },
        ],
      },
      { path: '/entrar', element: <h1>Entrar</h1> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...renderWithProviders(<RouterProvider router={router} />, queryClient) }
}

/** Define la cookie de CSRF como lo haría el navegador tras el primer GET con sesión OIDC (`null` la borra). */
export function setCsrfCookie(value: string | null) {
  document.cookie = value === null ? 'XSRF-TOKEN=; Max-Age=0; Path=/' : `XSRF-TOKEN=${value}; Path=/`
}

/** Hace creer a la aplicación que es el build de producción: sin inicio de sesión de demostración. */
export function stubProductionBuild() {
  vi.stubEnv('DEV', false)
  vi.stubEnv('MODE', 'production')
}

/** `BroadcastChannel` determinista: entrega al instante a las demás instancias abiertas con el mismo nombre. */
export class FakeChannel {
  static open = new Set<FakeChannel>()
  onmessage: ((event: { data: unknown }) => void) | null = null
  readonly name: string
  constructor(name: string) {
    this.name = name
    FakeChannel.open.add(this)
  }
  postMessage(data: unknown) {
    for (const channel of FakeChannel.open) {
      if (channel !== this && channel.name === this.name) channel.onmessage?.({ data })
    }
  }
  close() {
    FakeChannel.open.delete(this)
  }
}

/** Lo que publicaría otra pestaña. */
export function fromAnotherTab(type: SessionMessageType, tab = 'otra-pestana') {
  const remote = new FakeChannel('resolve-session')
  act(() => remote.postMessage({ type, tab }))
  remote.close()
}
