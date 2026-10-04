export type Placement = 'right' | 'bottom-start' | 'bottom-end'

export interface Size {
  width: number
  height: number
}

export interface Rect extends Size {
  top: number
  left: number
}

export interface Position {
  top: number
  left: number
  placement: Placement | 'left' | 'top-start' | 'top-end'
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Coloca un elemento flotante junto a su ancla sin salir del viewport.
 * Si no cabe en el lado pedido lo voltea (derecha → izquierda, abajo → arriba) y después lo ajusta a los bordes.
 */
export function computePosition(
  anchor: Rect,
  floating: Size,
  placement: Placement,
  viewport: Size,
  { gap = 8, margin = 8 } = {},
): Position {
  const maxLeft = viewport.width - floating.width - margin
  const maxTop = viewport.height - floating.height - margin

  if (placement === 'right') {
    const centeredTop = anchor.top + anchor.height / 2 - floating.height / 2
    const right = anchor.left + anchor.width + gap
    const fitsRight = right + floating.width + margin <= viewport.width
    const left = fitsRight ? right : anchor.left - gap - floating.width
    return {
      top: clamp(centeredTop, margin, maxTop),
      left: clamp(left, margin, maxLeft),
      placement: fitsRight ? 'right' : 'left',
    }
  }

  const below = anchor.top + anchor.height + gap
  const fitsBelow = below + floating.height + margin <= viewport.height
  const above = anchor.top - gap - floating.height
  const useAbove = !fitsBelow && above >= margin
  const alignedLeft = placement === 'bottom-start' ? anchor.left : anchor.left + anchor.width - floating.width
  const vertical = placement === 'bottom-start' ? 'start' : 'end'

  return {
    top: clamp(useAbove ? above : below, margin, maxTop),
    left: clamp(alignedLeft, margin, maxLeft),
    placement: useAbove ? `top-${vertical}` : `bottom-${vertical}`,
  }
}
