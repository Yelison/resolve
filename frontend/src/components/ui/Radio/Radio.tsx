import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import choice from '../shared/choice.module.css'
import styles from './Radio.module.css'

export interface RadioProps extends Omit<ComponentProps<'input'>, 'type' | 'children'> {
  label: ReactNode
}

/** Opción de un grupo; agrupa varias con el mismo `name` dentro de un fieldset con legend. */
export function Radio({ label, className, ...props }: RadioProps) {
  return (
    <label className={cx(choice.choice, className)}>
      <span className={choice.box}>
        <input type="radio" className={cx(choice.input, styles.input)} {...props} />
        <span className={cx(choice.mark, styles.dot)} aria-hidden="true" />
      </span>
      <span>{label}</span>
    </label>
  )
}
