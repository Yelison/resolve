import { FormaProvider } from '@yelison/forma-ui'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ToastProvider } from '../components/ui'
import { formaStrings } from './formaStrings'

/**
 * Proveedores de toda la aplicación, por encima del router. `FormaProvider` va aquí y no en `AppShell` porque `/entrar`,
 * `/catalogo` y la demostración estática son rutas hermanas de la shell: solo la raíz cubre todas, y «Enviando…» tiene
 * que salir en cada pantalla. Los tests de integración montan este mismo árbol (`renderWithProviders`).
 */
export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <FormaProvider strings={formaStrings}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </FormaProvider>
  )
}
