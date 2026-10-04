import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'

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
