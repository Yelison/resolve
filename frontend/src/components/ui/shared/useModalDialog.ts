import { useEffect, useRef, type MouseEvent, type PointerEvent, type SyntheticEvent } from 'react'
import { useScrollLock } from '@yelison/forma-ui'

/**
 * Gestiona un <dialog> nativo controlado: lo abre como modal (foco atrapado y fondo inerte),
 * bloquea el scroll, cierra con Escape o clic en el fondo y devuelve el foco al elemento anterior.
 * El contenido debe ir dentro de un hijo que ocupe todo el diálogo para distinguir el clic en el fondo.
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  // El bloqueo de scroll es el del paquete, el mismo contador que usa su `Dialog`: si un diálogo se abre sobre este
  // (el menú de cuenta vive en el drawer), cerrar uno no suelta el bloqueo ni la compensación de la barra del otro.
  useScrollLock(open)
  const ref = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  /** Cierre iniciado por el propio hook al pasar `open` a false: no debe volver a avisar al padre. */
  const closingRef = useRef(false)
  /**
   * Solo cuenta como clic en el fondo si el puntero se pulsó en él y no se soltó en otro sitio: una selección que
   * termina en el fondo, o una pulsación en el fondo que se suelta dentro, es un arrastre, no un clic.
   */
  const pressedOnBackdropRef = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()

    return () => {
      if (dialog.open) {
        closingRef.current = true
        dialog.close()
      }
      previouslyFocused?.focus()
    }
  }, [open])

  return {
    ref,
    onCancel(event: SyntheticEvent<HTMLDialogElement>) {
      event.preventDefault()
      onCloseRef.current()
    },
    /** Cierres nativos que no pasan por cancel, como un formulario con method="dialog". */
    onClose() {
      if (closingRef.current) {
        closingRef.current = false
        return
      }
      onCloseRef.current()
    },
    onPointerDown(event: PointerEvent<HTMLDialogElement>) {
      pressedOnBackdropRef.current = event.target === event.currentTarget
    },
    onPointerUp(event: PointerEvent<HTMLDialogElement>) {
      // El navegador envía el clic de una pulsación y una suelta en elementos distintos a su ancestro común, que es el
      // propio diálogo: sin esto, una pulsación en el fondo soltada dentro lo cerraría.
      if (event.target !== event.currentTarget) pressedOnBackdropRef.current = false
    },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      const pressedOnBackdrop = pressedOnBackdropRef.current
      pressedOnBackdropRef.current = false
      if (pressedOnBackdrop && event.target === event.currentTarget) onCloseRef.current()
    },
  }
}
