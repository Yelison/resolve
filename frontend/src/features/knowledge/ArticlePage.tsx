import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError } from '../../api/client'
import { Alert, Badge, Button, buttonClassName, EmptyState, Skeleton } from '../../components/ui'
import type { Article } from '../../domain/article'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { formatDateTime } from '../../lib/format'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
import { useTimeZone } from '../session/useTimeZone'
import { ArticleOutline } from './ArticleOutline'
import { ArticleProse } from './ArticleProse'
import { ArticleBody } from './markdown/ArticleBody'
import { outline } from './markdown/outline'
import { readingTimeMinutes } from './markdown/readingTime'
import { useArticle } from './queries'
import styles from './ArticlePage.module.css'

/**
 * Lectura de un artículo. La ruta se carga bajo demanda, así que importar aquí `ArticleBody` y `outline` mantiene
 * `react-markdown` fuera del paquete principal. Un cliente no recibe borradores ni artículos internos: el servidor
 * responde 404 y la página lo trata igual que un enlace roto.
 */
export function ArticlePage() {
  const slug = useParams().slug ?? ''
  const article = useArticle(slug)
  const me = useMe()

  // Sin conocer el rol no se pinta nada: evita enseñar un instante las acciones del personal a un cliente.
  if (article.isPending || me.isPending) {
    return (
      <div className={pageStyles.page}>
        <Skeleton lines={2} label="Cargando artículo…" />
        <Skeleton lines={6} label="" />
      </div>
    )
  }
  // Un fallo de red al refrescar un artículo ya leído no lo sustituye por un error; un 404 sí (ya no existe o no se ve).
  const data = article.data
  if (!data || (article.isError && isApiError(article.error, 404))) {
    const missing = isApiError(article.error, 404)
    return (
      <div className={pageStyles.page}>
        <PageHeader title={missing ? 'Artículo no encontrado' : 'No pudimos cargar el artículo'} />
        <EmptyState
          kind={missing ? 'noResults' : 'error'}
          title={missing ? 'No existe el artículo' : 'Revisa tu conexión'}
          description={missing ? 'Puede que el enlace sea incorrecto o que no tengas acceso.' : 'Vuelve a intentarlo.'}
          action={
            missing ? (
              <Link to="/conocimiento" className={buttonClassName({ variant: 'secondary' })}>
                Volver a la base de conocimiento
              </Link>
            ) : (
              <Button variant="secondary" onClick={() => void article.refetch()}>
                Reintentar
              </Button>
            )
          }
        />
      </div>
    )
  }
  const isStaff = me.data?.role === 'admin' || me.data?.role === 'agent'
  return (
    <ArticleView
      key={data.id}
      article={data}
      isStaff={isStaff}
      supportEmail={me.data?.organization.supportEmail ?? null}
    />
  )
}

interface ArticleViewProps {
  article: Article
  isStaff: boolean
  supportEmail: string | null
}

function ArticleView({ article, isStaff, supportEmail }: ArticleViewProps) {
  const timeZone = useTimeZone()
  const wide = useMediaQuery('(min-width: 1200px)')
  // `outline` ejecuta todo el pipeline de Markdown: se calcula una vez por texto y no en cada render.
  const entries = useMemo(() => outline(article.body), [article.body])
  const minutes = readingTimeMinutes(article.body)
  const published = article.status === 'published'

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={article.title}
        description={
          <Link to={`/conocimiento?category=${encodeURIComponent(article.category.slug)}`} className={styles.category}>
            {article.category.name}
          </Link>
        }
        actions={
          isStaff && (
            <Link to={`/conocimiento/${article.slug}/editar`} className={buttonClassName({ variant: 'secondary' })}>
              Editar artículo
            </Link>
          )
        }
      />

      {isStaff && !published && (
        <Alert tone="amber" title="Borrador: los clientes no lo ven">
          Publícalo desde el editor cuando esté listo.
        </Alert>
      )}

      {!wide && <ArticleOutline entries={entries} variant="details" />}

      <div className={styles.layout}>
        <article className={styles.card}>
          {isStaff && (
            <div className={styles.badges}>
              <Badge tone={published ? 'green' : 'amber'}>{published ? 'Publicado' : 'Borrador'}</Badge>
              {article.visibility === 'internal' && <Badge>Solo el equipo</Badge>}
            </div>
          )}
          <p className={styles.meta}>
            Actualizado: {formatDateTime(new Date(article.updatedAt), undefined, timeZone)} · Lectura: {minutes}{' '}
            {minutes === 1 ? 'minuto' : 'minutos'}
          </p>
          <ArticleProse>
            <ArticleBody source={article.body} />
          </ArticleProse>
        </article>

        <aside className={styles.side} aria-label="Ayuda del artículo">
          {wide && <ArticleOutline entries={entries} variant="aside" />}
          <section className={styles.help} aria-labelledby="help-title">
            <h2 id="help-title" className={styles.helpTitle}>
              ¿Necesitas ayuda?
            </h2>
            {isStaff ? (
              <Link to="/tickets/nuevo" className={buttonClassName({ variant: 'secondary' })}>
                Crear un ticket
              </Link>
            ) : supportEmail ? (
              <p className={styles.helpText}>
                Contacta con soporte: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
              </p>
            ) : (
              <p className={styles.helpText}>Contacta con el equipo de soporte de tu organización.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
