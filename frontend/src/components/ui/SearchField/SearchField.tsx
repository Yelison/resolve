import type { ComponentProps, KeyboardEvent } from 'react'
import { cx } from '../../../lib/cx'
import { Icon } from '../Icon/Icon'
import styles from './SearchField.module.css'

export interface SearchFieldProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'value'> {
  /** Nombre accesible; el campo no tiene etiqueta visible. */
  label: string
  /** Texto actual de la búsqueda. */
  value: string
  /** Se llama con el nuevo texto. */
  onValueChange: (value: string) => void
  /** Clase del contenedor del campo. */
  fieldClassName?: string
}

/** Campo de búsqueda con icono. Escape borra el texto. */
export function SearchField({ label, value, onValueChange, fieldClassName, onKeyDown, ...props }: SearchFieldProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && value) {
      event.preventDefault()
      onValueChange('')
    }
    onKeyDown?.(event)
  }

  return (
    <label className={cx(styles.field, fieldClassName)}>
      <Icon name="search" />
      <span className="visually-hidden">{label}</span>
      <input
        type="search"
        className={styles.input}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        {...props}
      />
    </label>
  )
}
