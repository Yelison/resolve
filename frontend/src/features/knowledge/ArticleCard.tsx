import { Link } from 'react-router'
import { Badge } from '../../components/ui'
import type { ArticleSummary } from '../../domain/article'
import { cx } from '../../lib/cx'
import { formatDateTime } from '../../lib/format'
import styles from './ArticleCard.module.css'

export interface ArticleCardProps {
  article: ArticleSummary
  timeZone?: string
  /** El estado solo lo ve el personal: a un cliente (o mientras no se sabe el rol) no se le enseña. */
  showStatus?: boolean
}

/** «Hoy, 20:51» se lee «Actualizado hoy, 20:51»: la fecha formateada empieza por mayúscula solo como palabra suelta. */
function updatedLabel(updatedAt: string, timeZone?: string): string {
  const when = formatDateTime(new Date(updatedAt), undefined, timeZone)
  return `Actualizado ${when.charAt(0).toLowerCase()}${when.slice(1)}`
}

/**
 * Tarjeta de un artículo: categoría, título como enlace, extracto en dos líneas como máximo y fecha. El extracto es
 * texto plano que prepara el servidor; se pinta como texto, nunca como HTML. El recorte es solo visual: el texto
 * completo sigue en el DOM para los lectores de pantalla y en el `title`.
 */
export function ArticleCard({ article, timeZone, showStatus = false }: ArticleCardProps) {
  return (
    <article className={styles.card}>
      <p className={styles.eyebrow}>
        <span className={styles.category} title={article.category.name}>
          {article.category.name}
        </span>
        {showStatus && article.status === 'draft' && <Badge tone="amber">Borrador</Badge>}
      </p>
      <h3 className={styles.title}>
        <Link to={`/conocimiento/${article.slug}`} className={styles.link} title={article.title}>
          <span className={styles.linkText}>{article.title}</span>
        </Link>
      </h3>
      {article.excerpt && (
        <p className={styles.excerpt} title={article.excerpt}>
          {article.excerpt}
        </p>
      )}
      <p className={styles.updated}>{updatedLabel(article.updatedAt, timeZone)}</p>
    </article>
  )
}

/** Tarjeta de carga con la estructura de `ArticleCard`: cada barra mide la altura de línea del texto que sustituye. */
export function ArticleCardSkeleton() {
  return (
    <div className={cx(styles.card, styles.skeleton)} aria-hidden="true">
      <span className={cx(styles.category, styles.bar, styles.short)} />
      <span className={cx(styles.title, styles.bar)} />
      <span className={cx(styles.excerpt, styles.bar)} />
      <span className={cx(styles.excerpt, styles.bar)} />
      <span className={cx(styles.updated, styles.bar, styles.short)} />
    </div>
  )
}
