import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Placement } from '../../../lib/position'
import { useFloating } from '../shared/useFloating'
import styles from './Tooltip.module.css'

/** Margen para mover el puntero del disparador al tooltip sin que se cierre. */
const HIDE_DELAY = 120

export interface TooltipTriggerProps {
  ref: (node: HTMLElement | null) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onFocus: () => void
  onBlur: () => void
  'aria-describedby'?: string
}

export interface TooltipProps {
  content: ReactNode
  placement?: Placement
  /**
   * Enlaza el texto como descripción del disparador. Desactívalo cuando el disparador
   * ya tiene ese mismo texto como nombre accesible, para no leerlo dos veces.
   */
  describe?: boolean
  children: (trigger: TooltipTriggerProps) => ReactNode
}

/**
 * Tooltip visible con puntero y con foco, colocado junto al disparador y dentro del viewport.
 * Se puede recorrer con el puntero y Escape lo oculta (WCAG 1.4.13).
 */
export function Tooltip({ content, placement = 'right', describe = true, children }: TooltipProps) {
  const id = useId()
  const [pointerInside, setPointerInside] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const open = (hovered || focused) && !dismissed
  const { setAnchor, setFloating, style, portalContainer } = useFloating<HTMLElement, HTMLDivElement>(open, placement)

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // El primer Escape solo oculta el tooltip; no debe cerrar también un diálogo que lo contenga.
      event.preventDefault()
      event.stopPropagation()
      setDismissed(true)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  useEffect(() => {
    if (pointerInside || !hovered) return
    const timer = window.setTimeout(() => setHovered(false), HIDE_DELAY)
    return () => window.clearTimeout(timer)
  }, [pointerInside, hovered])

  function enter() {
    setPointerInside(true)
    setHovered(true)
    setDismissed(false)
  }

  function leave() {
    setPointerInside(false)
  }

  return (
    <>
      {children({
        ref: setAnchor,
        onPointerEnter: enter,
        onPointerLeave: leave,
        onFocus: () => {
          setDismissed(false)
          setFocused(true)
        },
        onBlur: () => setFocused(false),
        'aria-describedby': describe && open ? id : undefined,
      })}
      {open &&
        createPortal(
          <div
            ref={setFloating}
            id={id}
            role="tooltip"
            className={styles.tooltip}
            style={style}
            onPointerEnter={enter}
            onPointerLeave={leave}
          >
            {content}
          </div>,
          portalContainer,
        )}
    </>
  )
}
