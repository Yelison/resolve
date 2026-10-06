import { useEffect, useRef } from 'react'

/** Elementos en los que `/` es un carácter más y no un atajo. */
const editable =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="searchbox"]'

/**
 * Atajos que abren la búsqueda: Ctrl+K (⌘K en Mac) desde cualquier sitio y `/` cuando el foco no está en un campo
 * editable ni hay otro diálogo abierto. Con la búsqueda ya abierta no hacen nada, pero Ctrl+K sigue sin abrir la del
 * navegador.
 */
export function useSearchShortcuts(open: boolean, onOpen: () => void) {
  const state = useRef({ open, onOpen })
  useEffect(() => {
    state.current = { open, onOpen }
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      const { open, onOpen } = state.current
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault()
        if (!open) onOpen()
        return
      }
      // `/` se escribe con Mayús en varias distribuciones (Mayús+7), así que Mayús no lo descarta.
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || open) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(editable) || (target instanceof HTMLElement && target.isContentEditable)) return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      onOpen()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
