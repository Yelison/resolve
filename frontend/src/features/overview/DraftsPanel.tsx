import { Link } from 'react-router'
import { EmptyState } from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import { useArticleList } from '../knowledge/queries'
import { useTimeZone } from '../session/useTimeZone'
import { BlockError } from './BlockError'
import { Ghost } from './Ghost'
import { useRetryFocus } from './useRetryFocus'
import styles from './SidePanels.module.css'

/** Cuántos borradores se listan. */
export const DRAFTS_SIZE = 3

/** «Hoy, 02:44» → «hoy, 02:44»: va a mitad de frase. */
const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase('es') + text.slice(1)

const ghostRows = Array.from({ length: DRAFTS_SIZE }, (_, index) => index)

/**
 * «Borradores sin publicar»: los 3 editados más recientemente y un enlace a Conocimiento con el filtro de borradores.
 * Solo se monta para quien puede escribir artículos; el servidor no entrega borradores a un cliente.
 */
export function DraftsPanel() {
  const drafts = useArticleList({ status: 'draft', page: 1, pageSize: DRAFTS_SIZE, sort: 'updatedAt,desc' })
  const focus = useRetryFocus<HTMLElement>(drafts.isSuccess)
  const timeZone = useTimeZone()
  const total = drafts.data?.totalItems ?? 0
  return (
    <section ref={focus.ref} className={styles.panel} aria-labelledby="overview-drafts" tabIndex={-1}>
      <div className={styles.header}>
        <h2 id="overview-drafts" className={styles.title}>
          Borradores sin publicar {drafts.data && total > 0 && <span className={styles.muted}>{total}</span>}
        </h2>
      </div>
      {drafts.isPending ? (
        <Ghost label="Cargando los borradores…">
          <ul className={styles.drafts}>
            {ghostRows.map((row) => (
              <li key={row} className={styles.draft}>
                <span className={styles.draftTitle}>Configurar las notificaciones por correo de tu equipo</span>
                <span className={styles.draftMeta}>Primeros pasos · editado hoy</span>
              </li>
            ))}
          </ul>
        </Ghost>
      ) : drafts.isError ? (
        <div className={styles.state}>
          <BlockError
            error={drafts.error}
            failureCount={drafts.failureCount}
            title="No pudimos cargar los borradores"
            restrictedTitle="No tienes permiso para ver los borradores"
            retryLabel="Reintentar cargar los borradores"
            onRetry={() => focus.retry(drafts.refetch)}
          />
        </div>
      ) : drafts.data!.items.length === 0 ? (
        <EmptyState
          icon="check"
          headingLevel={3}
          title="No hay borradores sin publicar"
          description="Los artículos sin publicar aparecerán aquí."
        />
      ) : (
        <>
          <ul className={styles.drafts}>
            {drafts.data!.items.map((article) => (
              <li key={article.id} className={styles.draft}>
                <Link to={`/conocimiento/${article.slug}/editar`} className={styles.draftTitle}>
                  {article.title}
                </Link>
                <span className={styles.draftMeta}>
                  {article.category.name} · editado{' '}
                  {lowerFirst(formatDateTime(new Date(article.updatedAt), undefined, timeZone))}
                </span>
              </li>
            ))}
          </ul>
          <Link to="/conocimiento?status=draft" className={styles.link}>
            {total === 1 ? 'Ver el borrador' : `Ver los ${total} borradores`}
          </Link>
        </>
      )}
    </section>
  )
}
