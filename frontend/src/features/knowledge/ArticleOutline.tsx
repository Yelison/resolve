import type { MouseEvent } from 'react'
import { cx } from '../../lib/cx'
import type { OutlineEntry } from './markdown/outline'
import styles from './ArticleOutline.module.css'

export interface ArticleOutlineProps {
  entries: OutlineEntry[]
  /** `aside` es el panel fijo de escritorio; `details` se pliega encima del texto en anchos menores y en la vista previa. */
  variant: 'aside' | 'details'
  className?: string
}

/** Lleva al encabezado y le pasa el foco: la URL no cambia, así que la shell no devuelve el foco al contenido. */
function goToHeading(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const heading = document.getElementById(id)
  if (!heading) return
  event.preventDefault()
  heading.setAttribute('tabindex', '-1')
  heading.scrollIntoView({ block: 'start' })
  heading.focus({ preventScroll: true })
}

/** Índice «En este artículo» con un enlace por encabezado `##` y `###`. No dibuja nada si el texto no tiene ninguno. */
export function ArticleOutline({ entries, variant, className }: ArticleOutlineProps) {
  if (entries.length === 0) return null
  const links = (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.id} className={cx(entry.level === 3 && styles.nested)}>
          <a href={`#${entry.id}`} className={styles.link} onClick={(event) => goToHeading(event, entry.id)}>
            {entry.text}
          </a>
        </li>
      ))}
    </ul>
  )
  if (variant === 'details') {
    return (
      <details className={cx(styles.details, className)}>
        <summary className={styles.summary}>En este artículo</summary>
        <nav aria-label="En este artículo">{links}</nav>
      </details>
    )
  }
  return (
    <nav aria-labelledby="outline-title" className={cx(styles.aside, className)}>
      <h2 id="outline-title" className={styles.title}>
        En este artículo
      </h2>
      {links}
    </nav>
  )
}
