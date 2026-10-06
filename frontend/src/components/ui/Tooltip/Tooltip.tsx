import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Placement } from '../../../lib/position'
import { useFloating } from '../shared/useFloating'
import styles from './Tooltip.module.css'

/** Margen para mover el puntero del disparador al tooltip sin que se cierre. */
const HIDE_DELAY = 120

/**
 * Cierre del tooltip que está abierto. Solo puede haber uno: al abrirse otro, este se oculta al instante, sin esperar
 * el margen de cierre, así que al recorrer varios iconos con el puntero o el foco no se acumulan etiquetas.
 */
const active: { hide: (() => void) | null } = { hide: null }

function claimActive(hide: () => void) {
  if (active.hide && active.hide !== hide) active.hide()
  active.hide = hide
}

export interface TooltipTriggerProps {
  /** Registra el disparador como ancla de posición del tooltip. */
  ref: (node: HTMLElement | null) => void
  /** Abre el tooltip al entrar el puntero. */
  onPointerEnter: () => void
  /** Cierra el tooltip tras un breve margen al salir el puntero. */
  onPointerLeave: () => void
  /** Abre el tooltip al recibir foco. */
  onFocus: () => void
  /** Cierra el tooltip al perder el foco. */
  onBlur: () => void
  /** Id del tooltip mientras está abierto y `describe` es `true`. */
  'aria-describedby'?: string
}

export interface TooltipProps {
  /** Contenido del tooltip. */
  content: ReactNode
  /** Lado del disparador donde aparece. Por defecto, `right`. */
  placement?: Placement
  /**
   * Enlaza el texto como descripción del disparador. Desactívalo cuando el disparador
   * ya tiene ese mismo texto como nombre accesible, para no leerlo dos veces.
   */
  describe?: boolean
  /** Recibe las props del disparador, que hay que esparcir en el elemento. */
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
  const hide = useCallback(() => {
    setPointerInside(false)
    setHovered(false)
    setFocused(false)
  }, [])
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

  // Deja de ser el tooltip activo al desmontarse, para que nadie llame a un cierre huérfano.
  useEffect(
    () => () => {
      if (active.hide === hide) active.hide = null
    },
    [hide],
  )

  function enter() {
    claimActive(hide)
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
          claimActive(hide)
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
