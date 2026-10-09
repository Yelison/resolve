import styles from './FirstResponseBar.module.css'

export interface FirstResponseBarProps {
  /** Mediana del periodo en minutos; `null` si no hubo primeras respuestas (no se dibuja la barra). */
  value: number | null
  /** Mediana del periodo anterior; `null` si no la hay (no se dibuja su marca). */
  previous: number | null
  /** Objetivo en minutos. */
  target: number
}

/** Margen sobre el mayor de los tres valores para que ninguna marca quede pegada al extremo. */
const HEADROOM = 1.25

const percent = (n: number) => `${Math.round(n * 100) / 100}%`

/**
 * Barra de la primera respuesta: el valor del periodo como relleno, la marca discontinua del periodo anterior y la
 * marca continua del objetivo. Las dos marcas se nombran debajo, en una fila que se parte si no caben, así que los
 * textos no se pisan aunque las marcas estén muy juntas. La barra es decorativa: el valor y la comparación ya están
 * escritos en la tarjeta.
 */
export function FirstResponseBar({ value, previous, target }: FirstResponseBarProps) {
  const scale = Math.max(value ?? 0, previous ?? 0, target, 1) * HEADROOM
  const at = (minutes: number) => percent((minutes / scale) * 100)
  return (
    <div className={styles.bar}>
      <div className={styles.track} aria-hidden="true">
        {value !== null && <span className={styles.fill} style={{ width: at(value) }} />}
        {previous !== null && <span className={styles.previous} style={{ left: at(previous) }} />}
        <span className={styles.target} style={{ left: at(target) }} />
      </div>
      <ul className={styles.marks}>
        {previous !== null && (
          <li className={styles.mark}>
            <span className={styles.previousGlyph} aria-hidden="true" />
            antes {previous}
          </li>
        )}
        <li className={styles.mark}>
          <span className={styles.targetGlyph} aria-hidden="true" />
          objetivo {target}&nbsp;min
        </li>
      </ul>
    </div>
  )
}
