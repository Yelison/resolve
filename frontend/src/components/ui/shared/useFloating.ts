import { useCallback, useLayoutEffect, useState } from 'react'
import { computePosition, type Placement, type Position } from '../../../lib/position'

/**
 * Posiciona un elemento flotante (fixed, en un portal) junto a su ancla y lo recoloca
 * al hacer scroll o cambiar el tamaño de la ventana mientras está abierto.
 * Ancla y flotante se guardan en estado: `setAnchor` y `setFloating` sirven como callback refs.
 */
export function useFloating<TAnchor extends HTMLElement, TFloating extends HTMLElement>(
  open: boolean,
  placement: Placement,
) {
  const [anchor, setAnchor] = useState<TAnchor | null>(null)
  const [floating, setFloating] = useState<TFloating | null>(null)
  const [position, setPosition] = useState<Position | null>(null)

  const update = useCallback(() => {
    if (!anchor || !floating) return
    setPosition(
      computePosition(
        anchor.getBoundingClientRect(),
        { width: floating.offsetWidth, height: floating.offsetHeight },
        placement,
        { width: document.documentElement.clientWidth, height: window.innerHeight },
      ),
    )
  }, [anchor, floating, placement])

  useLayoutEffect(() => {
    if (!open || !floating) return
    // Medir el DOM y colocar el flotante antes de pintar exige actualizar el estado en este layout effect.
    // oxlint-disable-next-line react/set-state-in-effect
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, floating, update])

  const style =
    open && position
      ? { position: 'fixed' as const, top: position.top, left: position.left }
      : { position: 'fixed' as const, top: 0, left: 0, visibility: 'hidden' as const }

  // Dentro de un <dialog> modal solo es visible e interactivo lo que cuelga del propio diálogo (top layer).
  const portalContainer = anchor?.closest('dialog') ?? document.body

  return { anchor, setAnchor, floating, setFloating, style, positioned: open && position !== null, portalContainer }
}
