import { useCallback, useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Icon } from '../Icon/Icon'
import choice from '../shared/choice.module.css'
import styles from './Checkbox.module.css'

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'children'> {
  /** Etiqueta asociada a la casilla; es el nombre accesible */
  label: ReactNode
  /** Oculta la etiqueta visualmente pero la mantiene para lectores de pantalla. */
  hideLabel?: boolean
  /** Estado mixto, por ejemplo en «seleccionar todo» con una selección parcial. */
  indeterminate?: boolean
}

export function Checkbox({ label, hideLabel = false, indeterminate = false, className, ref, ...props }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <label className={cx(choice.choice, className)}>
      <span className={choice.box}>
        <input ref={setRefs} type="checkbox" className={cx(choice.input, styles.input)} {...props} />
        <span className={choice.mark} aria-hidden="true">
          {indeterminate ? <span className={styles.dash} /> : <Icon name="check" size={16} />}
        </span>
      </span>
      <span className={hideLabel ? 'visually-hidden' : undefined}>{label}</span>
    </label>
  )
}
