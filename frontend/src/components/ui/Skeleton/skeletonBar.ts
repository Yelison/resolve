import { cx } from '../../../lib/cx'
import styles from './Skeleton.module.css'

/**
 * Clases de la barra fantasma para un esqueleto que usa las cajas reales de un componente: se suman al elemento (con un
 * texto de relleno) y toma su alto y su ancho de él. Una sola animación y un solo color para todos los esqueletos.
 */
export const skeletonBarClassName = cx(styles.bar, styles.barOverText)
