import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Field } from '../Field/Field'
import fieldStyles from '../Field/Field.module.css'
import { Icon } from '../Icon/Icon'
import styles from './Combobox.module.css'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
}

export interface ComboboxProps {
  label: ReactNode
  /** Texto escrito; el componente que lo usa decide cómo buscar con él. */
  query: string
  onQueryChange: (query: string) => void
  options: ComboboxOption[]
  /** Opción elegida (su valor y etiqueta, para mostrarla aunque la búsqueda cambie). */
  selected: ComboboxOption | null
  onSelect: (option: ComboboxOption) => void
  loading?: boolean
  placeholder?: string
  hint?: ReactNode
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
            aria-controls={listboxId}
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
