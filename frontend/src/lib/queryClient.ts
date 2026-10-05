import { QueryClient } from '@tanstack/react-query'
import { ApiError, DEMO_USER_EVENT } from '../api/client'

/** Reintenta fallos de red y errores 5xx; un 4xx no cambia al repetir la misma petición. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false
  return failureCount < 2
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
    },
  },
})

/** Vacía la caché cuando cambia el usuario de demostración. Devuelve la función que quita el oyente. */
export function clearCacheOnDemoUserChange(client: QueryClient): () => void {
  const clear = () => client.clear()
  window.addEventListener(DEMO_USER_EVENT, clear)
  return () => window.removeEventListener(DEMO_USER_EVENT, clear)
}
