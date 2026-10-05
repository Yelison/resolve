import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import styles from './Tabs.module.css'

export interface TabItem {
  /** Identificador de la pestaña. */
  id: string
  /** Contenido del botón de la pestaña. */
  label: ReactNode
  /** Contenido del panel; solo se renderiza el de la pestaña activa. */
  content: ReactNode
}

export interface TabsProps {
  /** Nombre accesible de la lista de pestañas. */
  label: string
  /** Pestañas y sus paneles. */
  items: TabItem[]
  /** Pestaña activa (controlado). */
  value?: string
  /** Pestaña activa inicial cuando no es controlado; por defecto, la primera. */
  defaultValue?: string
  /** Se llama con el id de la pestaña al seleccionarla. */
  onChange?: (id: string) => void
  /** Clase adicional del contenedor. */
  className?: string
}

/** Pestañas con el patrón APG: flechas, Inicio/Fin y activación automática. */
export function Tabs({ label, items, value, defaultValue, onChange, className }: TabsProps) {
  const baseId = useId()
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.id)
  const requested = value ?? internalValue
  // Si el valor no corresponde a ninguna pestaña, la primera queda activa para que la lista siga siendo usable.
  const selected = items.some((item) => item.id === requested) ? requested : items[0]?.id
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function select(index: number) {
    const item = items[index]
    if (!item) return
    setInternalValue(item.id)
    onChange?.(item.id)
    tabRefs.current[index]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const current = items.findIndex((item) => item.id === selected)
    const last = items.length - 1
    const next = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    select(next)
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {items.map((item, index) => {
          const isSelected = item.id === selected
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              className={styles.tab}
              onClick={() => select(index)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          tabIndex={0}
          hidden={item.id !== selected}
          className={styles.panel}
        >
          {item.id === selected && item.content}
        </div>
      ))}
    </div>
  )
}
