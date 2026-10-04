import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Field } from '../Field/Field'
import fieldStyles from '../Field/Field.module.css'
import styles from './Textarea.module.css'

export interface TextareaProps extends Omit<ComponentProps<'textarea'>, 'children'> {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
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
