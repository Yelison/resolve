import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import choice from '../shared/choice.module.css'
import styles from './Switch.module.css'

export interface SwitchProps extends Omit<ComponentProps<'input'>, 'type' | 'role' | 'children'> {
  /** Texto asociado al interruptor. */
  label: ReactNode
}

/** Interruptor de efecto inmediato. Usa Checkbox cuando el cambio se confirma con un botón de guardar. */
export function Switch({ label, className, ...props }: SwitchProps) {
  return (
    <label className={cx(choice.choice, className)}>
      <span className={choice.box}>
        <input type="checkbox" role="switch" className={styles.track} {...props} />
        <span className={styles.thumb} aria-hidden="true" />
      </span>
      <span>{label}</span>
    </label>
  )
}
