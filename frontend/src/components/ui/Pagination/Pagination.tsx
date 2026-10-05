import { cx } from '../../../lib/cx'
import { Icon } from '../Icon/Icon'
import styles from './Pagination.module.css'
import { clampPage, pageRange } from './pageRange'

export interface PaginationProps {
  /** Página actual, empezando en 1. */
  page: number
  /** Resultados por página. */
  pageSize: number
  /** Total de resultados. */
  total: number
  /** Se llama con la página elegida. */
  onPageChange: (page: number) => void
  /** Clase del contenedor. */
  className?: string
}

const formatNumber = new Intl.NumberFormat('es').format

export function Pagination({ page: requestedPage, pageSize, total, onPageChange, className }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = clampPage(requestedPage, pageCount)
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav aria-label="Paginación" className={cx(styles.pagination, className)}>
      <p className={styles.summary}>
        {first}–{last} de {formatNumber(total)} resultados
      </p>
      {pageCount > 1 && (
        <ul className={styles.pages}>
          <li>
            <button
              type="button"
              className={styles.page}
              aria-label="Página anterior"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <Icon name="chevron" className={styles.previous} />
            </button>
          </li>
          {pageRange(page, pageCount).map((token, index) =>
            token === 'gap' ? (
              <li key={`gap-${index}`} className={styles.gap} aria-hidden="true">
                …
              </li>
            ) : (
              <li key={token}>
                <button
                  type="button"
                  className={styles.page}
                  aria-label={`Página ${token}`}
                  aria-current={token === page ? 'page' : undefined}
                  onClick={() => onPageChange(token)}
                >
                  {token}
                </button>
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              className={styles.page}
              aria-label="Página siguiente"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              <Icon name="chevron" className={styles.next} />
            </button>
          </li>
        </ul>
      )}
    </nav>
  )
}
