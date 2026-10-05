import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Field } from '../Field/Field'
import fieldStyles from '../Field/Field.module.css'
import { Icon } from '../Icon/Icon'
import styles from './Select.module.css'

export interface SelectProps extends ComponentProps<'select'> {
  /** Etiqueta visible del select. */
  label: ReactNode
  /** Ayuda permanente bajo el select. */
  hint?: ReactNode
  /** Mensaje de error; marca el select como inválido. */
  error?: ReactNode
  /** Clase del contenedor del campo. */
  fieldClassName?: string
}

/** Select nativo con la apariencia del diseño: conserva teclado, lectores de pantalla y pickers móviles. */
export function Select({ label, hint, error, id, fieldClassName, className, children, ...props }: SelectProps) {
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
        <div className={styles.wrapper}>
          <select className={cx(fieldStyles.control, styles.select, className)} {...props} {...control}>
            {children}
          </select>
          <Icon name="chevron" className={styles.chevron} />
        </div>
      )}
    </Field>
  )
}
