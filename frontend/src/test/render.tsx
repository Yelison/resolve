import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProviders } from '../app/AppProviders'

/** Cliente de consultas aislado por test, sin reintentos para que los errores se vean al momento. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
}

export function renderWithProviders(ui: ReactNode, queryClient = createTestQueryClient()) {
  return {
    queryClient,
    ...render(<AppProviders queryClient={queryClient}>{ui}</AppProviders>),
  }
}
