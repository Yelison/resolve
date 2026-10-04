import { useEffect, useRef, type MouseEvent, type PointerEvent, type SyntheticEvent } from 'react'
import { lockScroll } from '../../../lib/scrollLock'

/**
 * Gestiona un <dialog> nativo controlado: lo abre como modal (foco atrapado y fondo inerte),
 * bloquea el scroll, cierra con Escape o clic en el fondo y devuelve el foco al elemento anterior.
 * El contenido debe ir dentro de un hijo que ocupe todo el diálogo para distinguir el clic en el fondo.
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  /** Cierre iniciado por el propio hook al pasar `open` a false: no debe volver a avisar al padre. */
  const closingRef = useRef(false)
  /** Solo cuenta como clic en el fondo si el puntero también se pulsó en el fondo (no al terminar una selección). */
  const pressedOnBackdropRef = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    const unlockScroll = lockScroll()

    return () => {
      if (dialog.open) {
        closingRef.current = true
        dialog.close()
      }
      unlockScroll()
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
    onClick(event: MouseEvent<HTMLDialogElement>) {
      const pressedOnBackdrop = pressedOnBackdropRef.current
      pressedOnBackdropRef.current = false
      if (pressedOnBackdrop && event.target === event.currentTarget) onCloseRef.current()
    },
  }
}
