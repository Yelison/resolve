import { Link } from 'react-router'
import { Badge, Table, TableCell, TableHeaderCell, TableRow } from '../../components/ui'
import type { ArticleSummary } from '../../domain/article'
import { cx } from '../../lib/cx'
import { formatDateTime } from '../../lib/format'
import styles from './ArticlesTable.module.css'

export interface ArticlesTableProps {
  articles: ArticleSummary[]
  /** Texto visible bajo la tabla, p. ej. «Mostrando 4 resultados». */
  caption: string
  /** Los clientes solo ven artículos publicados: para ellos la columna de estado no aporta nada. */
  showStatus: boolean
  timeZone?: string
}

/**
 * Tabla de artículos sobre `Table`: tarjetas en contenedores estrechos (< 560 px), título, estado y fecha hasta la
 * tabla completa, que añade la categoría.
 */
export function ArticlesTable({ articles, caption, showStatus, timeZone }: ArticlesTableProps) {
  return (
    <Table
      label="Artículos"
      caption={caption}
      actionsLabel="Acciones"
      className={cx(styles.table, !showStatus && styles.withoutStatus)}
      header={
        <>
          <TableHeaderCell area="name">Artículo</TableHeaderCell>
          <TableHeaderCell area="category" className={styles.headerCategory}>
            Categoría
          </TableHeaderCell>
          {showStatus && <TableHeaderCell area="status">Estado</TableHeaderCell>}
          <TableHeaderCell area="updated">Actualizado</TableHeaderCell>
        </>
      }
    >
      {articles.map((article) => (
        <ArticleRow key={article.id} article={article} showStatus={showStatus} timeZone={timeZone} />
      ))}
    </Table>
  )
}

function ArticleRow({
  article,
  showStatus,
  timeZone,
}: {
  article: ArticleSummary
  showStatus: boolean
  timeZone?: string
}) {
  const published = article.status === 'published'
  return (
    <TableRow>
      <TableCell kind="name">
        <Link to={`/conocimiento/${article.slug}`} className={styles.titleLink} title={article.title}>
          {article.title}
        </Link>
      </TableCell>
      <span role="none" className={styles.meta}>
        <span role="cell" className={styles.category} title={article.category.name}>
          {article.category.name}
        </span>
      </span>
      <span role="none" className={styles.chips}>
        {showStatus && (
          <span role="cell" className={styles.status}>
            <Badge tone={published ? 'green' : 'amber'}>{published ? 'Publicado' : 'Borrador'}</Badge>
          </span>
        )}
        <span role="cell" className={styles.updated}>
          <span className="visually-hidden">Actualizado </span>
          {formatDateTime(new Date(article.updatedAt), undefined, timeZone)}
        </span>
      </span>
      <TableCell kind="actions">{null}</TableCell>
    </TableRow>
  )
}
