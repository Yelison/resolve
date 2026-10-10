import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Field } from '../Field/Field'
import fieldStyles from '../shared/control.module.css'
import { Icon } from '../Icon/Icon'
import styles from './Combobox.module.css'

export interface ComboboxOption {
  /** Valor único de la opción; se usa como clave y para marcar la elegida */
  value: string
  /** Texto principal de la opción; también se muestra en el campo cuando está elegida */
  label: string
  /** Texto secundario bajo la etiqueta en la lista */
  description?: string
}

export interface ComboboxProps {
  /** Etiqueta del campo; es su nombre accesible */
  label: ReactNode
  /** Texto escrito; el componente que lo usa decide cómo buscar con él. */
  query: string
  /** Se llama al escribir con el nuevo texto, y con una cadena vacía al elegir una opción o al perder el foco */
  onQueryChange: (query: string) => void
  /** Opciones de la lista desplegable; se muestran tal cual, sin filtrar */
  options: ComboboxOption[]
  /** Opción elegida (su valor y etiqueta, para mostrarla aunque la búsqueda cambie). */
  selected: ComboboxOption | null
  /** Se llama con la opción elegida con clic o con Enter */
  onSelect: (option: ComboboxOption) => void
  /** Si es true y no hay opciones, la lista muestra «Buscando…»; por defecto false */
  loading?: boolean
  /** Texto de ayuda del campo vacío */
  placeholder?: string
  /** Texto de ayuda asociado al campo */
  hint?: ReactNode
  /** Mensaje de error asociado al campo */
  error?: ReactNode
  /** Texto cuando la búsqueda no encuentra nada. */
  emptyText?: string
}

/**
 * Combobox con lista desplegable (patrón APG «combobox with listbox popup»): se escribe para filtrar, las flechas
 * recorren las opciones, Enter elige y Escape cierra.
 */
export function Combobox({
  label,
  query,
  onQueryChange,
  options,
  selected,
  onSelect,
  loading = false,
  placeholder,
  hint,
  error,
  emptyText = 'Sin resultados',
}: ComboboxProps) {
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const optionId = (index: number) => `${listboxId}-option-${index}`
  const inputValue = open ? query : (selected?.label ?? query)

  function choose(option: ComboboxOption) {
    onSelect(option)
    onQueryChange('')
    setOpen(false)
    setActiveIndex(-1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setOpen(true)
        setActiveIndex((index) => Math.min(index + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'Enter': {
        const option = options[activeIndex]
        if (open && option) {
          event.preventDefault()
          choose(option)
        }
        break
      }
      case 'Escape':
        if (open) {
          event.preventDefault()
          setOpen(false)
        }
        break
    }
  }

  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <div className={styles.wrapper}>
          <input
            {...control}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            className={cx(fieldStyles.control, styles.input)}
            placeholder={placeholder}
            value={inputValue}
            onChange={(event) => {
              onQueryChange(event.target.value)
              setOpen(true)
              setActiveIndex(-1)
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => {
              // El texto a medio escribir se descarta: el campo vuelve a mostrar la opción elegida.
              setOpen(false)
              onQueryChange('')
            }}
            onKeyDown={onKeyDown}
          />
          <Icon name="chevron" className={styles.chevron} />
          {open && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={typeof label === 'string' ? label : undefined}
              className={styles.listbox}
            >
              {options.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === selected?.value}
                  className={cx(styles.option, index === activeIndex && styles.active)}
                  // mousedown evita que el blur del input cierre la lista antes del clic.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.description && <span className={styles.optionDescription}>{option.description}</span>}
                </li>
              ))}
              {options.length === 0 && (
                <li className={styles.status} role="presentation">
                  {loading ? 'Buscando…' : emptyText}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </Field>
  )
}
