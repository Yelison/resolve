import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError, DEMO_USER_EVENT } from '../api/client'
import { setDemoMaintenance } from './demoMaintenance'
import { isDemoMaintenance } from './mutationError'

/** Reintenta fallos de red y errores 5xx; un 4xx no cambia al repetir la misma petición. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false
  return failureCount < 2
}

/** Cualquier petición que salga bien prueba que la demostración volvió; el `503` de reinicio la marca en mantenimiento. */
const reportMaintenance = (error: unknown) => {
  if (isDemoMaintenance(error)) setDemoMaintenance(true)
}
const reportRecovered = () => setDemoMaintenance(false)

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportMaintenance, onSuccess: reportRecovered }),
  mutationCache: new MutationCache({ onError: reportMaintenance, onSuccess: reportRecovered }),
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
