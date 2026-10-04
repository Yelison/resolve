import { createContext, useContext, type ReactNode } from 'react'

export type ToastTone = 'success' | 'error'

export interface ToastOptions {
  tone?: ToastTone
  title: ReactNode
  description?: ReactNode
  /** Milisegundos antes de cerrarse solo. Se pausa mientras el puntero o el foco están encima. */
  duration?: number
}

export interface ToastApi {
  show: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return api
}
