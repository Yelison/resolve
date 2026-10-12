import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../../lib/cx'
import { normalizeText } from '../../../lib/normalizeText'
import type { Placement } from '../../../lib/position'
import { Icon, type IconName } from '../Icon/Icon'
import { SearchField } from '../SearchField/SearchField'
import { useFloating } from '../shared/useFloating'
import styles from './Menu.module.css'

export interface MenuItem {
  /** Identificador estable del elemento. */
  id: string
  /** Texto del elemento. */
  label: string
  /** Icono opcional junto al texto. */
  icon?: IconName
  /** Tono visual; `danger` resalta acciones destructivas. */
  tone?: 'default' | 'danger'
  /** Si es `true`, el elemento no se puede seleccionar. */
  disabled?: boolean
  /** Segunda línea más pequeña bajo el texto (p. ej. el rol en cada espacio). */
  description?: string
  /** Contenido decorativo antes del texto (p. ej. el cuadro de iniciales de un espacio). */
  leading?: ReactNode
  /**
   * Convierte el elemento en una opción de un grupo: `true` es la elegida y lleva una marca; `false`, las demás. El rol
   * pasa a `menuitemradio`. Sin esta propiedad es una acción corriente.
   */
  checked?: boolean
  /** Dibuja un separador antes del elemento. */
  separatorBefore?: boolean
  /** Si es `true`, el buscador del menú (`search`) filtra el elemento por su texto. Los demás se muestran siempre. */
  searchable?: boolean
  /** Nombre completo para el ratón cuando el texto se corta con «…». */
  title?: string
  /** Se llama al seleccionar el elemento. */
  onSelect: () => void
}

export interface MenuSearch {
  /** Nombre accesible del campo; también su texto de ayuda. */
  label: string
  /** Texto cuando ningún elemento filtrable coincide. */
  emptyText: string
}

export interface MenuTriggerProps {
  /** Registra el elemento que ancla el menú. */
  ref: (node: HTMLElement | null) => void
  /** Indica que el disparador abre un menú. */
  'aria-haspopup': 'menu'
  /** Si el menú está abierto. */
  'aria-expanded': boolean
  /** Id del menú mientras está abierto. */
  'aria-controls'?: string
  /** Abre o cierra el menú. */
  onClick: (event: MouseEvent<HTMLElement>) => void
  /** Abre el menú con flecha abajo (primer elemento) o arriba (último). */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

export interface MenuProps {
  /** Nombre accesible del menú. */
  label: string
  /** Elementos del menú, en orden. */
  items: MenuItem[]
  /** Posición respecto al disparador; por defecto `bottom-end`. */
  placement?: Extract<Placement, 'bottom-start' | 'bottom-end'>
  /** Campo para filtrar los elementos `searchable`. Va encima de la lista, fuera del `role="menu"`. */
  search?: MenuSearch
  /** Explicación bajo la lista; el menú la lleva como descripción (p. ej. por qué hay acciones deshabilitadas). */
  note?: string
  /** Menú más ancho, para filas con dos líneas. */
  wide?: boolean
  /** Función que recibe las props del disparador y devuelve su elemento. */
  children: (trigger: MenuTriggerProps) => ReactNode
}

/** Menú de acciones con el patrón ARIA menu button: flechas, Inicio/Fin, búsqueda por letra y Escape. */
export function Menu({ label, items, placement = 'bottom-end', search, note, wide, children }: MenuProps) {
  const menuId = useId()
  const noteId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [query, setQuery] = useState('')
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const { anchor, setAnchor, floating, setFloating, style, positioned, portalContainer } = useFloating<
    HTMLElement,
    HTMLDivElement
  >(open, placement)

  // El filtro solo toca los elementos `searchable`: las acciones del pie (p. ej. «Tus espacios») siguen a la vista.
  const needle = search ? normalizeText(query.trim()) : ''
  const visible = needle
    ? items.filter((item) => !item.searchable || normalizeText(item.label).includes(needle))
    : items
  const noMatches = search !== undefined && needle !== '' && !visible.some((item) => item.searchable)

  const enabledIndexes = visible.flatMap((item, index) => (item.disabled ? [] : [index]))

  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(false)
      setQuery('')
      if (restoreFocus) anchor?.focus()
    },
    [anchor],
  )

  function openAt(edge: 'first' | 'last') {
    // Con una opción elegida (el espacio actual) se abre sobre ella, como un grupo de opciones nativo.
    const checked = edge === 'first' ? visible.findIndex((item) => item.checked && !item.disabled) : -1
    const index =
      checked >= 0 ? checked : edge === 'first' ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1]
    setActiveIndex(index ?? 0)
    setOpen(true)
  }

  const searchFocused = useRef(false)
  useEffect(() => {
    if (!open) searchFocused.current = false
    // El menú está oculto hasta que se coloca, y un elemento oculto no admite foco.
    if (!open || !positioned || document.activeElement === searchRef.current) return
    // Con buscador, el foco empieza en él (para eso está); mientras se escribe no salta a la lista.
    if (search && !searchFocused.current) {
      searchFocused.current = true
      searchRef.current?.focus()
      return
    }
    itemRefs.current[activeIndex]?.focus()
  }, [open, positioned, activeIndex, search])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (floating?.contains(target) || anchor?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close, anchor, floating])

  function move(step: 1 | -1) {
    const position = enabledIndexes.indexOf(activeIndex)
    const next = enabledIndexes[(position + step + enabledIndexes.length) % enabledIndexes.length]
    if (next !== undefined) setActiveIndex(next)
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown':
        move(1)
        break
      case 'ArrowUp':
        move(-1)
        break
      case 'Home':
        setActiveIndex(enabledIndexes[0] ?? 0)
        break
      case 'End':
        setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? 0)
        break
      case 'Escape':
        close(true)
        break
      case 'Tab':
        close(false)
        return
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
        const letter = event.key.toLowerCase()
        const match = enabledIndexes.find((index) => visible[index]?.label.toLowerCase().startsWith(letter))
        if (match === undefined) return
        setActiveIndex(match)
      }
    }
    event.preventDefault()
  }

  // El buscador está fuera del `role="menu"` (un campo de texto no es un elemento de menú y las letras irían a la
  // búsqueda por letra): flecha abajo baja a la lista, Escape cierra y Tab sale.
  function onSearchKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown' && enabledIndexes.length > 0) {
      event.preventDefault()
      setActiveIndex(enabledIndexes[0] ?? 0)
      itemRefs.current[enabledIndexes[0] ?? 0]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      // El primer Escape borra el texto (lo hace `SearchField`); con el campo vacío cierra el menú.
      if (!query) close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  function select(item: MenuItem) {
    if (item.disabled) return
    close(true)
    item.onSelect()
  }

  return (
    <>
      {children({
        ref: setAnchor,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => (open ? close(false) : openAt('first')),
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            openAt('first')
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            openAt('last')
          }
        },
      })}
      {open &&
        createPortal(
          <div ref={setFloating} className={cx(styles.menu, wide && styles.wide)} style={style}>
            {search && (
              <div className={styles.search} onKeyDown={onSearchKeyDown}>
                <SearchField
                  ref={searchRef}
                  label={search.label}
                  placeholder={search.label}
                  value={query}
                  onValueChange={(value) => {
                    setQuery(value)
                    setActiveIndex(0)
                  }}
                />
              </div>
            )}
            <div
              id={menuId}
              role="menu"
              aria-label={label}
              aria-describedby={note ? noteId : undefined}
              className={styles.list}
              onKeyDown={onMenuKeyDown}
            >
              {visible.map((item, index) => (
                <Fragment key={item.id}>
                  {item.separatorBefore && index > 0 && <div role="separator" className={styles.separator} />}
                  <button
                    ref={(node) => {
                      itemRefs.current[index] = node
                    }}
                    type="button"
                    role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                    aria-checked={item.checked}
                    tabIndex={index === activeIndex ? 0 : -1}
                    aria-disabled={item.disabled || undefined}
                    aria-label={item.description ? `${item.label}, ${item.description}` : undefined}
                    title={item.title}
                    className={cx(styles.item, item.tone === 'danger' && styles.danger, item.checked && styles.checked)}
                    onClick={() => select(item)}
                  >
                    {item.leading}
                    {item.icon && <Icon name={item.icon} />}
                    {item.description ? (
                      <span className={styles.text}>
                        <span className={styles.label}>{item.label}</span>
                        <span className={styles.description}>{item.description}</span>
                      </span>
                    ) : (
                      item.label
                    )}
                    {item.checked && <Icon name="check" className={styles.mark} />}
                  </button>
                </Fragment>
              ))}
            </div>
            {noMatches && (
              <p role="status" className={styles.empty}>
                {search?.emptyText}
              </p>
            )}
            {note && (
              <p id={noteId} className={styles.note}>
                {note}
              </p>
            )}
          </div>,
          portalContainer,
        )}
    </>
  )
}
