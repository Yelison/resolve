import type { ArticleStatus } from '../../domain/article'
import { cx } from '../../lib/cx'
import styles from './StatusPills.module.css'

export interface StatusPillsProps {
  status: ArticleStatus | undefined
  /** Artículos de cada estado con los filtros actuales; `undefined` mientras cargan o si no se pudieron contar. */
  counts: Record<ArticleStatus, number | undefined>
  onChange: (status: ArticleStatus | undefined) => void
}

const pills: { status: ArticleStatus; label: string }[] = [
  { status: 'published', label: 'Publicados' },
  { status: 'draft', label: 'Borradores' },
]

/**
 * Filtro de estado en píldoras con su recuento. Sin ninguna pulsada la lista trae todos los estados; pulsar una
 * filtra por ella y volver a pulsarla quita el filtro.
 */
export function StatusPills({ status, counts, onChange }: StatusPillsProps) {
  return (
    <div role="group" aria-label="Filtrar por estado" className={styles.pills}>
      {pills.map((pill) => {
        const pressed = status === pill.status
        const count = counts[pill.status]
        return (
          <button
            key={pill.status}
            type="button"
            className={cx(styles.pill, pressed && styles.pressed)}
            aria-pressed={pressed}
            onClick={() => onChange(pressed ? undefined : pill.status)}
          >
            {pill.label}
            {count !== undefined && <span className={styles.count}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
