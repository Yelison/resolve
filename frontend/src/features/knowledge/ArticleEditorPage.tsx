import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { isApiError } from '../../api/client'
import {
  Alert,
  Button,
  buttonClassName,
  Editor,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  useToast,
} from '../../components/ui'
import type { Article, ArticleCreate, ArticlePatch, ArticleVisibility } from '../../domain/article'
import { clearDraft, useDraft } from '../../lib/useDraft'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { isDemoLimit, isLockTimeout, mutationErrorDetail } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { draftKey, parseDraft, serializeDraft, type ArticleDraft } from './articleDraft'
import { PublishPanel } from './PublishPanel'
import {
  useArticle,
  useCategories,
  useCreateArticle,
  usePublishArticle,
  useUnpublishArticle,
  useUpdateArticle,
} from './queries'
import styles from './ArticleEditorPage.module.css'

/** La vista previa es el único trozo del editor que importa `react-markdown`: no se descarga hasta que se abre. */
const ArticlePreview = lazy(() => import('./ArticlePreview'))

/**
 * Editor de artículos para `conocimiento/nuevo` (sin slug) y `conocimiento/:slug/editar`. La guardia de rol la pone la
 * ruta. Nada de lo que escribes se pierde: se guarda como borrador en este navegador mientras haya cambios sin enviar.
 */
export function ArticleEditorPage() {
  const slug = useParams().slug
  if (slug === undefined) return <ArticleForm key="nuevo" />
  return <ExistingArticle key={slug} slug={slug} />
}

function ExistingArticle({ slug }: { slug: string }) {
  // Sin recargas al volver a la pestaña ni al reconectar: la versión base del formulario solo cambia por escrituras
  // propias o por un conflicto que el formulario gestiona (un refetch silencioso la haría avanzar sin avisar).
  const article = useArticle(slug, { refetchOnFocus: false })
  if (article.isPending) {
    return (
      <div className={pageStyles.page}>
        <Skeleton lines={2} label="Cargando artículo…" />
        <Skeleton lines={6} label="" />
      </div>
    )
  }
  if (article.isError && !article.data) {
    const missing = isApiError(article.error, 404)
    return (
      <div className={pageStyles.page}>
        <PageHeader title={missing ? 'Artículo no encontrado' : 'No pudimos cargar el artículo'} />
        <EmptyState
          kind={missing ? 'noResults' : 'error'}
          title={missing ? 'No existe el artículo' : 'Revisa tu conexión'}
          description={missing ? 'Puede que el enlace sea incorrecto.' : 'Vuelve a intentarlo.'}
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
  return (
    <ArticleForm
      key={article.data.id}
      article={article.data}
      reloading={article.isFetching}
      reload={() => void article.refetch()}
    />
  )
}

interface Fields {
  title: string
  body: string
  categoryId: string
  visibility: ArticleVisibility
  allowFeedback: boolean
}

type FieldName = 'title' | 'body' | 'categoryId'
type FieldErrors = Partial<Record<FieldName, string>>

const emptyFields: Fields = { title: '', body: '', categoryId: '', visibility: 'public', allowFeedback: true }

const fieldsOf = (article: Article | undefined): Fields =>
  article
    ? {
        title: article.title,
        body: article.body,
        categoryId: article.category.id,
        visibility: article.visibility,
        allowFeedback: article.allowFeedback,
      }
    : emptyFields

function validate(fields: Fields): FieldErrors {
  const errors: FieldErrors = {}
  if (!fields.title.trim()) errors.title = 'Escribe un título.'
  if (!fields.body.trim()) errors.body = 'Escribe el contenido del artículo.'
  if (!fields.categoryId) errors.categoryId = 'Elige una categoría.'
  return errors
}

interface ArticleFormProps {
  /** Último artículo que llegó del servidor; ausente al crear. */
  article?: Article
  /** Hay una lectura del detalle en curso. */
  reloading?: boolean
  /** Vuelve a leer el detalle (para reintentar tras un 412 cuya recarga falló). */
  reload?: () => void
}

/** Un borrador esperando a que el usuario lo restaure: `changed` si el servidor cambió mientras editaba, `stale` si es de otra sesión. */
interface OfferedDraft {
  draft: ArticleDraft
  reason: 'changed' | 'stale'
}

function ArticleForm({ article, reloading = false, reload }: ArticleFormProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const key = draftKey(article?.slug)
  const [rawDraft, setRawDraft] = useDraft(key)
  // Versión base del formulario: la de carga o la de la respuesta de mi último guardado o cambio de estado. Es la del
  // `If-Match`, la de los cambios que se calculan y la del borrador; `article` (la caché) puede ir por delante si otra
  // persona guardó, y eso se gestiona más abajo en lugar de adoptarlo sin más.
  const [base, setBase] = useState(article)
  const server = fieldsOf(base)
  const version = base?.version ?? 0

  // Un borrador del navegador se aplica si se escribió sobre esta misma versión (una recarga a mitad de edición). Si el
  // servidor ya va por otra (p. ej. tras un 412 y recargar), se enseña la del servidor y se ofrece restaurar el borrador.
  const [initial] = useState(() => {
    const stored = parseDraft(rawDraft)
    const differs =
      stored !== null &&
      ((stored.title !== null && stored.title !== server.title) ||
        (stored.body !== null && stored.body !== server.body))
    if (!stored || !differs) return { fields: server, offered: null }
    if (stored.version === version) {
      return {
        fields: { ...server, title: stored.title ?? server.title, body: stored.body ?? server.body },
        offered: null,
      }
    }
    return { fields: server, offered: { draft: stored, reason: 'stale' as const } }
  })
  const [fields, setFields] = useState<Fields>(initial.fields)
  const [offered, setOffered] = useState<OfferedDraft | null>(initial.offered)
  // Versión base sobre la que dio 412 mi último guardado. Mientras la base siga siendo esa, la recarga no ha traído nada nuevo.
  const [conflictAt, setConflictAt] = useState<number | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState('edit')
  const formRef = useRef<HTMLFormElement>(null)

  const categories = useCategories()
  const create = useCreateArticle()
  const update = useUpdateArticle(article?.slug ?? '')
  const publish = usePublishArticle(article?.slug ?? '')
  const unpublish = useUnpublishArticle(article?.slug ?? '')
  const saving = create.isPending || update.isPending
  // Un envío recordado por acción: el reintento de un 503 de bloqueo repite esa llamada tal cual, con su versión.
  const saveSubmission = useRepeatableSubmission()
  const stateSubmission = useRepeatableSubmission()
  const [stateAction, setStateAction] = useState<'publish' | 'unpublish'>('publish')

  const textDirty = fields.title !== server.title || fields.body !== server.body
  const settingsDirty =
    fields.categoryId !== server.categoryId ||
    fields.visibility !== server.visibility ||
    fields.allowFeedback !== server.allowFeedback
  const dirty = textDirty || settingsDirty

  // Mantiene el borrador del navegador mientras haya texto sin guardar. Con un borrador pendiente de restaurar no
  // escribe: el guardado es el del usuario y no debe pisarse con el texto del servidor.
  useEffect(() => {
    if (offered) return
    setRawDraft(
      textDirty
        ? serializeDraft({
            title: fields.title !== server.title ? fields.title : null,
            body: fields.body !== server.body ? fields.body : null,
            version,
          })
        : '',
    )
  }, [offered, textDirty, fields.title, fields.body, server.title, server.body, version, setRawDraft])

  // Tras un intento fallido, el foco va al primer campo con error.
  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [attempt])

  function change(changes: Partial<Fields>) {
    // El reintento repetiría lo enviado, no lo que se ve ahora: editar retira el aviso de bloqueo.
    if (isLockTimeout(update.error)) update.reset()
    if (isLockTimeout(create.error)) create.reset()
    setFields((current) => ({ ...current, ...changes }))
    setErrors((current) => {
      const next = { ...current }
      for (const name of Object.keys(changes) as (keyof Fields)[]) delete next[name as FieldName]
      return next
    })
  }

  const serverErrors: FieldErrors = {}
  for (const error of [create.error, update.error]) {
    if (!isApiError(error, 400)) continue
    for (const name of ['title', 'body', 'categoryId'] as const) {
      serverErrors[name] ??= error.fieldError(name)
    }
  }
  const shown: FieldErrors = { ...serverErrors, ...errors }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const found = validate(fields)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setTab('edit')
      setAttempt((count) => count + 1)
      return
    }
    if (!article) {
      const body: ArticleCreate = {
        title: fields.title.trim(),
        body: fields.body,
        categoryId: fields.categoryId,
        visibility: fields.visibility,
        allowFeedback: fields.allowFeedback,
      }
      saveSubmission.send(() =>
        create.mutate(body, {
          onSuccess: (created) => {
            // Se borra el borrador antes de navegar: el siguiente «Nuevo artículo» no debe abrirse con este texto.
            clearDraft(key)
            toast.show({ title: 'Borrador creado' })
            void navigate(`/conocimiento/${created.slug}/editar`, { replace: true })
          },
          onError: (error) => {
            if (!isLockTimeout(error)) setAttempt((count) => count + 1)
          },
        }),
      )
      return
    }
    const changes: ArticlePatch = {}
    if (fields.title !== server.title) changes.title = fields.title.trim()
    if (fields.body !== server.body) changes.body = fields.body
    if (fields.categoryId !== server.categoryId) changes.categoryId = fields.categoryId
    if (fields.visibility !== server.visibility) changes.visibility = fields.visibility
    if (fields.allowFeedback !== server.allowFeedback) changes.allowFeedback = fields.allowFeedback
    if (Object.keys(changes).length === 0) return
    const variables = { version, changes }
    saveSubmission.send(() =>
      update.mutate(variables, {
        onSuccess: (saved) => {
          setBase(saved)
          setFields(fieldsOf(saved))
          toast.show({ title: 'Cambios guardados' })
        },
        // Un 412 recarga el detalle (lo hace la mutación); la versión nueva se trata abajo, igual que si llegara sola.
        onError: (error) => {
          if (isApiError(error, 412)) setConflictAt(variables.version)
          else if (!isLockTimeout(error)) setAttempt((count) => count + 1)
        },
      }),
    )
  }

  // Llegó una versión del servidor más nueva que la base y no es de un guardado mío (un 412, una recarga, una
  // invalidación): el servidor manda. Su texto pasa al formulario y, si yo tenía texto sin guardar distinto, queda
  // ofrecido para restaurarlo (el borrador local ya lo guarda con la versión base). Solo se ofrece lo que yo cambié, así
  // restaurarlo no revierte lo que la otra persona guardó en el otro campo. Los ajustes que toqué se conservan; los
  // demás siguen al servidor. Sin cambios míos, el formulario se actualiza en silencio.
  if (article && base && article.version > base.version) {
    const next = fieldsOf(article)
    setBase(article)
    const mine: ArticleDraft = {
      title: fields.title !== server.title ? fields.title : null,
      body: fields.body !== server.body ? fields.body : null,
      version,
    }
    if ((mine.title !== null && mine.title !== next.title) || (mine.body !== null && mine.body !== next.body)) {
      setOffered({ draft: mine, reason: 'changed' })
    }
    setFields((current) => ({
      title: next.title,
      body: next.body,
      categoryId: current.categoryId !== server.categoryId ? current.categoryId : next.categoryId,
      visibility: current.visibility !== server.visibility ? current.visibility : next.visibility,
      allowFeedback: current.allowFeedback !== server.allowFeedback ? current.allowFeedback : next.allowFeedback,
    }))
  }

  function restoreDraft() {
    if (!offered) return
    const { title, body } = offered.draft
    change({ ...(title !== null && { title }), ...(body !== null && { body }) })
    setOffered(null)
  }

  function discardDraft() {
    setOffered(null)
  }

  const slugTaken = isApiError(create.error, 409) && !isDemoLimit(create.error)
  const blockedReason = !base
    ? 'Guarda el borrador para poder publicarlo.'
    : dirty
      ? 'Guarda los cambios antes de cambiar el estado.'
      : null

  function changeState(action: 'publish' | 'unpublish') {
    const mutation = action === 'publish' ? publish : unpublish
    if (mutation.isPending) return
    setStateAction(action)
    stateSubmission.send(() =>
      mutation.mutate(undefined, {
        onSuccess: (changed) => {
          // La respuesta es la nueva versión base: sin esto el siguiente guardado iría con un `If-Match` anterior.
          setBase(changed)
          toast.show({ title: action === 'publish' ? 'Artículo publicado' : 'Artículo despublicado' })
        },
        onError: (error) => {
          if (isApiError(error, 409)) {
            toast.show({
              tone: 'error',
              title: action === 'publish' ? 'El artículo ya estaba publicado' : 'El artículo ya era un borrador',
            })
          }
        },
      }),
    )
  }
  const stateError = [publish.error, unpublish.error].find(
    (error) => error && !isApiError(error, 409) && !isLockTimeout(error),
  )

  const bodyErrorId = 'article-body-error'
  const bodyEmpty = fields.body.trim() === ''

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={base ? 'Editar artículo' : 'Nuevo artículo'}
        description="Crea una respuesta útil y mantenla actualizada."
        actions={
          article && (
            <Link to={`/conocimiento/${article.slug}`} className={buttonClassName({ variant: 'secondary' })}>
              Ver artículo
            </Link>
          )
        }
      />

      {offered && (
        <Alert tone="amber" title="Hay un borrador tuyo sin guardar" live={offered.reason === 'changed'}>
          <p>
            {offered.reason === 'changed'
              ? 'Alguien guardó este artículo mientras lo editabas. Mostramos su versión y conservamos tu texto en este navegador.'
              : 'Escribiste cambios en este navegador sobre una versión anterior del artículo. Mostramos la versión guardada.'}
          </p>
          <div className={styles.alertActions}>
            <Button variant="secondary" onClick={restoreDraft}>
              Restaurar mi borrador
            </Button>
            <Button variant="secondary" onClick={discardDraft}>
              Descartar
            </Button>
          </div>
        </Alert>
      )}
      {conflictAt === version && !reloading && (
        <Alert tone="red" title="Alguien guardó este artículo y no pudimos cargar su versión." live>
          <Button variant="secondary" onClick={reload}>
            Reintentar
          </Button>
        </Alert>
      )}
      {slugTaken && (
        <Alert tone="red" title="Otro artículo se acaba de crear con el mismo enlace; vuelve a intentarlo." live />
      )}
      <LockTimeoutAlert
        error={update.error ?? create.error}
        pending={saving}
        onRetry={saveSubmission.retry}
        what="guardar el artículo"
      />
      {(update.error &&
        !isApiError(update.error, 412) &&
        !isApiError(update.error, 400) &&
        !isLockTimeout(update.error)) ||
      (create.error && !slugTaken && !isApiError(create.error, 400) && !isLockTimeout(create.error)) ? (
        <Alert tone="red" title="No se pudo guardar el artículo" live>
          {mutationErrorDetail(update.error ?? create.error)}
        </Alert>
      ) : null}

      <div className={styles.layout}>
        <form ref={formRef} className={styles.card} noValidate onSubmit={submit}>
          <Input
            id="article-title"
            label="Título"
            value={fields.title}
            error={shown.title}
            onChange={(event) => change({ title: event.target.value })}
          />

          <Tabs
            label="Contenido del artículo"
            value={tab}
            onChange={setTab}
            items={[
              {
                id: 'edit',
                label: 'Escribir',
                content: (
                  <div className={styles.bodyField}>
                    <Editor
                      variant="article"
                      label="Contenido"
                      value={fields.body}
                      onChange={(body) => change({ body })}
                      invalid={Boolean(shown.body)}
                      describedBy={shown.body ? bodyErrorId : undefined}
                    />
                    {shown.body && (
                      <p id={bodyErrorId} className={styles.error} role="alert">
                        {shown.body}
                      </p>
                    )}
                  </div>
                ),
              },
              {
                id: 'preview',
                label: 'Vista previa',
                content: bodyEmpty ? (
                  <p className={styles.empty}>Escribe algo en el contenido para ver cómo quedará.</p>
                ) : (
                  <Suspense fallback={<Skeleton lines={4} label="Cargando vista previa…" />}>
                    <ArticlePreview source={fields.body} />
                  </Suspense>
                ),
              },
            ]}
          />

          <div className={styles.actions}>
            <Button type="submit" loading={saving} loadingLabel="Guardando…" disabled={Boolean(article) && !dirty}>
              {article ? 'Guardar' : 'Guardar borrador'}
            </Button>
            {textDirty && !offered && <p className={styles.draftNote}>Borrador guardado en este navegador</p>}
          </div>
        </form>

        <PublishPanel
          categories={categories.data}
          categoriesFailed={categories.isError}
          categoryId={fields.categoryId}
          categoryError={shown.categoryId}
          onCategoryChange={(categoryId) => change({ categoryId })}
          visibility={fields.visibility}
          onVisibilityChange={(visibility) => change({ visibility })}
          allowFeedback={fields.allowFeedback}
          onAllowFeedbackChange={(allowFeedback) => change({ allowFeedback })}
          status={base?.status ?? null}
          blockedReason={blockedReason}
          publishing={publish.isPending}
          unpublishing={unpublish.isPending}
          stateError={stateError ? mutationErrorDetail(stateError) : undefined}
          stateNotice={
            <LockTimeoutAlert
              error={[publish.error, unpublish.error].find(isLockTimeout)}
              pending={publish.isPending || unpublish.isPending}
              onRetry={stateSubmission.retry}
              what={stateAction === 'publish' ? 'publicar el artículo' : 'despublicar el artículo'}
            />
          }
          onPublish={() => changeState('publish')}
          onUnpublish={() => changeState('unpublish')}
        />
      </div>
    </div>
  )
}
