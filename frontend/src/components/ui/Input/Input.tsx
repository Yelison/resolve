import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Field } from '../Field/Field'
import fieldStyles from '../Field/Field.module.css'

export interface InputProps extends Omit<ComponentProps<'input'>, 'children'> {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Clase del contenedor del campo; `className` se aplica al input. */
  fieldClassName?: string
}

export function Input({ label, hint, error, id, fieldClassName, className, ...props }: InputProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      id={id}
      describedBy={props['aria-describedby']}
      className={fieldClassName}
    >
      {(control) => <input className={cx(fieldStyles.control, className)} {...props} {...control} />}
    </Field>
  )
}
