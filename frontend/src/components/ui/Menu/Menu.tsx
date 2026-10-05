import {
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
import type { Placement } from '../../../lib/position'
import { Icon, type IconName } from '../Icon/Icon'
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
  /** Se llama al seleccionar el elemento. */
  onSelect: () => void
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
  /** Función que recibe las props del disparador y devuelve su elemento. */
  children: (trigger: MenuTriggerProps) => ReactNode
}

/** Menú de acciones con el patrón ARIA menu button: flechas, Inicio/Fin, búsqueda por letra y Escape. */
export function Menu({ label, items, placement = 'bottom-end', children }: MenuProps) {
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const { anchor, setAnchor, floating, setFloating, style, positioned, portalContainer } = useFloating<
    HTMLElement,
    HTMLDivElement
  >(open, placement)

  const enabledIndexes = items.flatMap((item, index) => (item.disabled ? [] : [index]))

  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(false)
      if (restoreFocus) anchor?.focus()
    },
    [anchor],
  )

  function openAt(edge: 'first' | 'last') {
    const index = edge === 'first' ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1]
    setActiveIndex(index ?? 0)
    setOpen(true)
  }

  useEffect(() => {
    // El menú está oculto hasta que se coloca, y un elemento oculto no admite foco.
    if (open && positioned) itemRefs.current[activeIndex]?.focus()
  }, [open, positioned, activeIndex])

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
        const match = enabledIndexes.find((index) => items[index]?.label.toLowerCase().startsWith(letter))
        if (match === undefined) return
        setActiveIndex(match)
      }
    }
    event.preventDefault()
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
          <div
            ref={setFloating}
            id={menuId}
            role="menu"
            aria-label={label}
            className={styles.menu}
            style={style}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item, index) => (
              <button
                key={item.id}
                ref={(node) => {
                  itemRefs.current[index] = node
                }}
                type="button"
                role="menuitem"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-disabled={item.disabled || undefined}
                className={cx(styles.item, item.tone === 'danger' && styles.danger)}
                onClick={() => select(item)}
              >
                {item.icon && <Icon name={item.icon} />}
                {item.label}
              </button>
            ))}
          </div>,
          portalContainer,
        )}
    </>
  )
}
