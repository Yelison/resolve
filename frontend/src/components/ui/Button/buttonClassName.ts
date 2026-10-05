import { cx } from '../../../lib/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonStyleOptions {
  /** Variante visual; por defecto 'primary' */
  variant?: ButtonVariant
  /** Si es true aplica la clase de bloque (el botón ocupa todo el ancho); por defecto false */
  block?: boolean
  /** Clases adicionales que se añaden al final */
  className?: string
}

/** Clases de botón para reutilizarlas en enlaces que deben verse como botones. */
export function buttonClassName({ variant = 'primary', block = false, className }: ButtonStyleOptions = {}) {
  return cx(styles.button, styles[variant], block && styles.block, className)
}
