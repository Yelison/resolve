import { cx } from '../../../lib/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonStyleOptions {
  variant?: ButtonVariant
  block?: boolean
  className?: string
}

/** Clases de botón para reutilizarlas en enlaces que deben verse como botones. */
export function buttonClassName({ variant = 'primary', block = false, className }: ButtonStyleOptions = {}) {
  return cx(styles.button, styles[variant], block && styles.block, className)
}
