import { createContext, useContext, type ReactNode } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastAction {
  /** Texto visible del botón. */
  label: string
  /** Nombre accesible cuando el texto visible solo no distingue la acción de otras iguales en la página. */
  ariaLabel?: string
  /** Se ejecuta al pulsarlo; el aviso se cierra. */
  onSelect: () => void
  /** Milisegundos desde que aparece el aviso durante los que el botón no se activa (`aria-disabled`, sigue enfocable). */
  delay?: number
}

export interface ToastOptions {
  /**
   * Tipo de aviso. Por defecto, `success`.
   * - `success`: confirma una acción que ya se hizo (✓ verde).
   * - `error`: algo falló (rojo).
   * - `info`: solo informa, sin confirmar nada; p. ej. una función aún no disponible o un cambio de sesión (campana azul).
   */
  tone?: ToastTone
  /** Texto principal del aviso. */
  title: ReactNode
  /** Texto secundario del aviso. */
  description?: ReactNode
  /** Acción opcional del aviso (p. ej. «Reintentar»). Dale un `duration` largo: la persona decide cuándo usarla. */
  action?: ToastAction
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
