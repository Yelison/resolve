import { useEffect, useRef, type RefObject } from 'react'

/**
 * Si el foco estaba dentro del panel y el elemento que lo tenía desaparece (el botón «Quitar la selección», o la vista
 * previa que se vuelve a montar al cambiar de ticket con «Atrás»), el navegador lo deja en `body`. Aquí vuelve al propio
 * panel, que sigue montado y es enfocable por programa (`tabIndex={-1}`), en lugar de perderse.
 *
 * «Dentro» lo marca el último `focusin` del documento; un clic fuera de cualquier control lo borra, para no quitarle el
 * foco a quien lo soltó a propósito.
 */
export function usePanelFocusRecovery(panel: RefObject<HTMLElement | null>) {
  const inside = useRef(false)

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      inside.current = event.target instanceof Node && Boolean(panel.current?.contains(event.target))
    }
    const onPointerDown = () => {
      inside.current = false
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [panel])

  // Tras cada pintado: si el foco debía estar dentro y ya no lo está en ningún sitio, vuelve al panel.
  useEffect(() => {
    const element = panel.current
    if (
      inside.current &&
      element &&
      !element.contains(document.activeElement) &&
      document.activeElement === document.body
    ) {
      element.focus()
    }
  })
}
