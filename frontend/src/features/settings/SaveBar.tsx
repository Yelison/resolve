import { useLayoutEffect, useRef } from 'react'
import { Button } from '../../components/ui'
import styles from './SaveBar.module.css'

const listFormat = new Intl.ListFormat('es', { style: 'long', type: 'conjunction' })

/** «Tienes cambios sin guardar en «A», «B» y «C».»: dice qué cambió, no solo que algo cambió. */
function unsavedMessage(changed: readonly string[]) {
  if (changed.length === 0) return 'Sin cambios.'
  return `Tienes cambios sin guardar en ${listFormat.format(changed.map((label) => `«${label}»`))}.`
}

/**
 * Barra de guardar del formulario: dice qué cambió y ofrece «Descartar» y «Guardar cambios». Va pegada al borde inferior
 * de la ventana mientras el formulario es más largo, y al terminar él se queda en su sitio (nunca flota sobre lo que
 * va después). Su altura se reserva en el formulario (`--save-bar-height`) para que el foco por teclado deje cada campo
 * por encima de ella, y se sube lo que mida el aviso de la demostración, que está pegado al mismo borde.
 */
export function SaveBar({
  changed,
  pending,
  onDiscard,
}: {
  /** Nombres de los campos que cambiaron, tal como los ve la persona. */
  changed: readonly string[]
  pending: boolean
  onDiscard: () => void
}) {
  const bar = useRef<HTMLDivElement>(null)
  const dirty = changed.length > 0

  useLayoutEffect(() => {
    const element = bar.current
    if (!element) return undefined
    const form = element.closest('form')
    const root = document.documentElement
    // El aviso de la demostración publica su altura en `scroll-padding-bottom` del documento: se sube sobre ella.
    const syncInset = () => {
      element.style.bottom = `${Number.parseFloat(root.style.scrollPaddingBottom) || 0}px`
    }
    syncInset()
    const mutations = new MutationObserver(syncInset)
    mutations.observe(root, { attributes: true, attributeFilter: ['style'] })
    const reserve = () => form?.style.setProperty('--save-bar-height', `${element.offsetHeight}px`)
    reserve()
    const sizes = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(reserve)
    sizes?.observe(element)
    return () => {
      mutations.disconnect()
      sizes?.disconnect()
      form?.style.removeProperty('--save-bar-height')
    }
  }, [])

  return (
    <div ref={bar} className={styles.bar}>
      <p className={styles.message}>{unsavedMessage(changed)}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onDiscard} disabled={!dirty || pending}>
          Descartar
        </Button>
        <Button type="submit" disabled={!dirty} loading={pending} loadingLabel="Guardando…">
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
