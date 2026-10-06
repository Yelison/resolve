import { act, screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { vi } from 'vitest'
import type { MockRoute } from '../test/api'
import { LOCK_RETRY_DELAY_MS } from './mutationError'

/** Solo para tests: la respuesta del backend cuando una escritura agota la espera de un bloqueo. */
export const lockTimeoutRoute = (): MockRoute => ({
  status: 503,
  headers: { 'Retry-After': '1' },
  body: {
    status: 503,
    title: 'Recurso ocupado',
    detail: 'Otra operación está modificando este recurso. Inténtalo de nuevo en unos segundos.',
  },
})

export interface SentRequest {
  body: string
  ifMatch: string | null
}

/**
 * Responde cada petición con la siguiente ruta (la última se repite) y anota el cuerpo y el `If-Match` de cada una,
 * para comprobar que el reintento repite la misma petición.
 */
export function inOrder(seen: SentRequest[], ...routes: MockRoute[]) {
  let next = 0
  return async (request: Request): Promise<MockRoute> => {
    seen.push({ body: await request.clone().text(), ifMatch: request.headers.get('If-Match') })
    return routes[Math.min(next++, routes.length - 1)] as MockRoute
  }
}

/** Espera el aviso de bloqueo, deja pasar `Retry-After` (con temporizadores simulados) y pulsa «Reintentar …». */
export async function retryAfterLockTimeout(user: UserEvent, name: string) {
  const button = await screen.findByRole('button', { name })
  act(() => {
    vi.advanceTimersByTime(LOCK_RETRY_DELAY_MS)
  })
  await user.click(button)
}
