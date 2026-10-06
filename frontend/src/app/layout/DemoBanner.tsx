import styles from './DemoBanner.module.css'

export const DEMO_BANNER_TEXT = 'Demostración pública · los datos se reinician cada noche'

/**
 * Aviso persistente de la demostración pública: los datos son ficticios y se reinician. Es una región con nombre, no un
 * `alert`: está en todas las páginas y no debe interrumpir a un lector de pantalla en cada una. Va al final del
 * contenido y se pega al borde inferior de la ventana; así su aparición, cuando llega `/me`, no desplaza nada de lo que
 * ya se ve. No se puede cerrar.
 */
export function DemoBanner() {
  return (
    <section className={styles.banner} aria-label="Demostración pública">
      <p>{DEMO_BANNER_TEXT}</p>
    </section>
  )
}
