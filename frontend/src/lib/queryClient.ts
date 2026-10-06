import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError, DEMO_USER_EVENT } from '../api/client'
import { isDemoMaintenanceActive, setDemoMaintenance } from './demoMaintenance'
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
/**
 * Al volver la demostración, las vistas que fallaron durante el reinicio se piden de nuevo: «Reintentar» del aviso global
 * relee `/me`, y sin esto la página que se quedó en su error seguiría ahí hasta que la persona la reintentara también.
 */
const reportRecovered = () => {
  if (!isDemoMaintenanceActive()) return
  setDemoMaintenance(false)
  void queryClient.refetchQueries({ type: 'active', predicate: (query) => query.state.status === 'error' })
}

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
