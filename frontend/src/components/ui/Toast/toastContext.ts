import { createContext, useContext, type ReactNode } from 'react'

export type ToastTone = 'success' | 'error'

export interface ToastOptions {
  /** Tipo de aviso. Por defecto, `success`. */
  tone?: ToastTone
  /** Texto principal del aviso. */
  title: ReactNode
  /** Texto secundario del aviso. */
  description?: ReactNode
  /** Milisegundos antes de cerrarse solo. Se pausa mientras el puntero o el foco están encima. */
  duration?: number
}

export interface ToastApi {
  /** Muestra un aviso y devuelve su id. */
  show: (options: ToastOptions) => string
  /** Cierra el aviso con ese id. */
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return api
}
