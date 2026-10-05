import type { ComponentProps } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Badge.module.css'

export type BadgeTone = 'blue' | 'green' | 'amber' | 'red' | 'neutral'

export interface BadgeProps extends ComponentProps<'span'> {
  /** Color de la insignia; por defecto 'neutral' */
  tone?: BadgeTone
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cx(styles.badge, styles[tone], className)} {...props} />
}
