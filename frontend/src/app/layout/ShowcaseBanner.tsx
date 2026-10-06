import { DemoBanner } from './DemoBanner'
import styles from './ShowcaseBanner.module.css'

export const SHOWCASE_BANNER_TEXT = 'Demostración con datos de ejemplo · los cambios no se guardan'
export const SHOWCASE_REPOSITORY = 'https://github.com/Yelison/resolve'

/**
 * Aviso persistente de la demostración estática (`--mode showcase`): la API es la simulada de los tests e2e, así que nada
 * de lo que se ve o se hace es real ni se guarda. Se decide por el modo del build, no por `/me`: está desde el primer
 * pintado y su llegada no mueve nada. Reutiliza el patrón del aviso de la demostración pública (región con nombre pegada
 * al borde inferior, que reserva su altura para el foco).
 */
export function ShowcaseBanner() {
  return (
    <DemoBanner name="Demostración con datos de ejemplo">
      <p>
        {SHOWCASE_BANNER_TEXT} ·{' '}
        <a className={styles.link} href={SHOWCASE_REPOSITORY} target="_blank" rel="noreferrer">
          ver el código
        </a>
      </p>
    </DemoBanner>
  )
}
