import { useEffect, useRef, useState } from 'react'

/**
 * Si el foco estaba dentro del panel y el elemento que lo tenía desaparece (el botón «Quitar la selección», el botón
 * «Reintentar» de la vista previa que ya cargó, o la vista previa que se vuelve a montar al cambiar de ticket con
 * «Atrás»), el navegador lo deja en `body`. Aquí vuelve al propio panel, que sigue montado y es enfocable por programa
 * (`tabIndex={-1}`), en lugar de perderse.
 *
 * «Dentro» lo marca el último `focusin` del documento; un clic fuera de cualquier control lo borra, para no quitarle el
 * foco a quien lo soltó a propósito. La comprobación no depende de quién se vuelva a pintar: corre al perder el foco un
 * elemento del panel (`focusout`), al cambiar su contenido (un cambio interno, como la carga del ticket, no repinta la
 * bandeja) y tras cada pintado de la bandeja.
 */
export function usePanelFocusRecovery() {
  const inside = useRef(false)
  // El panel solo existe desde 1200 px y puede aparecer al ensanchar la ventana: se engancha cuando se monta, no al inicio.
  const [panel, setPanel] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const element = panel
    const recover = () => {
      if (inside.current && element?.isConnected && document.activeElement === document.body) element.focus()
    }
    const onFocusIn = (event: FocusEvent) => {
      inside.current = event.target instanceof Node && Boolean(panel?.contains(event.target))
    }
    const onPointerDown = () => {
      inside.current = false
    }
    // El foco se va del panel sin pasar a otro sitio (`relatedTarget` nulo): si acaba en `body`, vuelve. Se espera un
    // instante porque, al quitar el elemento, el navegador aún no ha movido el foco a `body` cuando avisa.
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget === null) queueMicrotask(() => requestAnimationFrame(recover))
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('pointerdown', onPointerDown)
    element?.addEventListener('focusout', onFocusOut)
    // Algunos navegadores no avisan con `focusout` al quitar del DOM el elemento enfocado: el cambio de contenido basta.
    const observer = element ? new MutationObserver(recover) : undefined
    if (element) observer?.observe(element, { childList: true, subtree: true })
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('pointerdown', onPointerDown)
      element?.removeEventListener('focusout', onFocusOut)
      observer?.disconnect()
    }
  }, [panel])

  // Tras cada pintado de la bandeja: si el foco debía estar dentro y no está en ningún sitio, vuelve al panel.
  useEffect(() => {
    if (
      inside.current &&
      panel &&
      !panel.contains(document.activeElement) &&
      document.activeElement === document.body
    ) {
      panel.focus()
    }
  })

  return setPanel
}
