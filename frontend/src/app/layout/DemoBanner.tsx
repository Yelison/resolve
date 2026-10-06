import { useEffect, useRef } from 'react'
import styles from './DemoBanner.module.css'

export const DEMO_BANNER_TEXT = 'Demostración pública · los datos se reinician cada noche'

/**
 * Aviso persistente de la demostración pública: los datos son ficticios y se reinician. Es una región con nombre, no un
 * `alert`: está en todas las páginas y no debe interrumpir a un lector de pantalla en cada una. Va al final del
 * contenido y se pega al borde inferior de la ventana; así su aparición, cuando llega `/me`, no desplaza nada de lo que
 * ya se ve. No se puede cerrar.
 *
 * Al estar pegado a la ventana, tapa lo que quede justo encima del borde. Su altura (varía con el ancho: envuelve en
 * móvil) se reserva en `scroll-padding-bottom` del documento, para que el foco por teclado y los saltos a un ancla
 * dejen el control por encima del aviso.
 */
export function DemoBanner() {
  const banner = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = banner.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const root = document.documentElement
    const observer = new ResizeObserver(() => {
      root.style.scrollPaddingBottom = `${element.offsetHeight}px`
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('scroll-padding-bottom')
    }
  }, [])
  return (
    <section ref={banner} className={styles.banner} aria-label="Demostración pública">
      <p>{DEMO_BANNER_TEXT}</p>
    </section>
  )
}
