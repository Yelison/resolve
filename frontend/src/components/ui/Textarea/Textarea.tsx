import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Field } from '../Field/Field'
import fieldStyles from '../shared/control.module.css'
import styles from './Textarea.module.css'

export interface TextareaProps extends Omit<ComponentProps<'textarea'>, 'children'> {
  /** Etiqueta del campo. */
  label: ReactNode
  /** Ayuda permanente bajo el control. */
  hint?: ReactNode
  /** Mensaje de error; marca el control como inválido y se anuncia al aparecer. */
  error?: ReactNode
  /** Clase adicional del contenedor del campo; `className` va al `textarea`. */
  fieldClassName?: string
}

export function Textarea({ label, hint, error, id, fieldClassName, className, rows = 4, ...props }: TextareaProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      id={id}
      describedBy={props['aria-describedby']}
      className={fieldClassName}
    >
      {(control) => (
        <textarea className={cx(fieldStyles.control, styles.textarea, className)} rows={rows} {...props} {...control} />
      )}
    </Field>
  )
}
