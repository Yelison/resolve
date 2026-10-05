import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Alert.module.css'

export type AlertTone = 'blue' | 'green' | 'amber' | 'red'

export interface AlertProps extends Omit<ComponentProps<'div'>, 'title'> {
  /** Color del aviso; por defecto 'blue' */
  tone?: AlertTone
  /** Título del aviso, siempre visible */
  title: ReactNode
  /**
   * Anuncia el aviso al aparecer. Úsalo solo para mensajes que surgen tras una acción;
   * un aviso presente desde la carga no debe interrumpir al lector de pantalla.
   */
  live?: boolean
}

export function Alert({ tone = 'blue', title, live = false, className, children, ...props }: AlertProps) {
  const liveRole = tone === 'red' ? 'alert' : 'status'
  return (
    <div className={cx(styles.alert, styles[tone], className)} role={live ? liveRole : undefined} {...props}>
      <p className={styles.title}>{title}</p>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  )
}
