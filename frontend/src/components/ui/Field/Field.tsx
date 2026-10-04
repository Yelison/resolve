import { useId, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Field.module.css'

export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

export interface FieldProps {
  label: ReactNode
  /** Ayuda permanente bajo el control. */
  hint?: ReactNode
  /** Mensaje de error; marca el control como inválido y se anuncia al aparecer. */
  error?: ReactNode
  /** Id del control; se genera uno si no se indica. */
  id?: string
  /** Ids adicionales que describen el control, además de la ayuda y el error. */
  describedBy?: string
  className?: string
  children: (control: FieldControlProps) => ReactNode
}

/** Etiqueta, ayuda y error enlazados a un control mediante id y aria-describedby. */
export function Field({ label, hint, error, id, describedBy: extraDescribedBy, className, children }: FieldProps) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [errorId, hintId, extraDescribedBy].filter(Boolean).join(' ') || undefined

  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
      </label>
      {children({
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}
