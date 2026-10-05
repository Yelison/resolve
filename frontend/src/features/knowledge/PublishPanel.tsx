import { useId, useState, type ReactNode } from 'react'
import { Alert, Badge, Button, Modal, Select, Switch, Radio } from '../../components/ui'
import type { ArticleStatus, ArticleVisibility, Category } from '../../domain/article'
import { focusPageHeadingIfFocusLost } from '../../lib/focusPageHeading'
import styles from './PublishPanel.module.css'

export interface PublishPanelProps {
  categories: Category[] | undefined
  categoriesFailed: boolean
  categoryId: string
  categoryError?: ReactNode
  onCategoryChange: (id: string) => void
  visibility: ArticleVisibility
  onVisibilityChange: (visibility: ArticleVisibility) => void
  allowFeedback: boolean
  onAllowFeedbackChange: (allow: boolean) => void
  /** `null` mientras el artículo no existe en el servidor. */
  status: ArticleStatus | null
  /** Por qué no se puede publicar o despublicar ahora (cambios sin guardar, artículo sin crear); `null` si se puede. */
  blockedReason: string | null
  publishing: boolean
  unpublishing: boolean
  /** Error de la última publicación o despublicación. */
  stateError?: ReactNode
  onPublish: () => void
  onUnpublish: () => void
}

/** Panel «Publicación»: categoría, visibilidad, valoraciones y estado con su acción. Debajo del formulario en anchos menores. */
export function PublishPanel({
  categories,
  categoriesFailed,
  categoryId,
  categoryError,
  onCategoryChange,
  visibility,
  onVisibilityChange,
  allowFeedback,
  onAllowFeedbackChange,
  status,
  blockedReason,
  publishing,
  unpublishing,
  stateError,
  onPublish,
  onUnpublish,
}: PublishPanelProps) {
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false)
  const groupName = useId()
  const reasonId = useId()
  const published = status === 'published'

  function closeConfirm() {
    setConfirmingUnpublish(false)
    focusPageHeadingIfFocusLost()
  }

  return (
    <section className={styles.panel} aria-labelledby={`${groupName}-title`}>
      <h2 id={`${groupName}-title`} className={styles.title}>
        Publicación
      </h2>

      <Select
        label="Categoría"
        value={categoryId}
        error={categoryError}
        disabled={categories === undefined && !categoriesFailed}
        hint={categoriesFailed ? 'No pudimos cargar las categorías.' : undefined}
        onChange={(event) => onCategoryChange(event.target.value)}
      >
        <option value="">Elige una categoría</option>
        {categories?.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Visibilidad</legend>
        <Radio
          name={`${groupName}-visibility`}
          label="Solo el equipo"
          checked={visibility === 'internal'}
          onChange={() => onVisibilityChange('internal')}
        />
        <Radio
          name={`${groupName}-visibility`}
          label="Clientes y equipo"
          checked={visibility === 'public'}
          onChange={() => onVisibilityChange('public')}
        />
      </fieldset>

      <Switch
        label="Permitir valoraciones"
        checked={allowFeedback}
        onChange={(event) => onAllowFeedbackChange(event.target.checked)}
      />

      <div className={styles.state}>
        <div className={styles.stateRow}>
          <span className={styles.legend}>Estado</span>
          {status === null ? (
            <Badge>Sin guardar</Badge>
          ) : (
            <Badge tone={published ? 'green' : 'amber'}>{published ? 'Publicado' : 'Borrador'}</Badge>
          )}
        </div>
        {published ? (
          <Button
            variant="secondary"
            block
            disabled={blockedReason !== null}
            aria-describedby={blockedReason ? reasonId : undefined}
            loading={unpublishing}
            loadingLabel="Despublicando…"
            onClick={() => setConfirmingUnpublish(true)}
          >
            Despublicar
          </Button>
        ) : (
          <Button
            block
            disabled={blockedReason !== null}
            aria-describedby={blockedReason ? reasonId : undefined}
            loading={publishing}
            loadingLabel="Publicando…"
            onClick={onPublish}
          >
            Publicar
          </Button>
        )}
        {blockedReason && (
          <p id={reasonId} className={styles.hint}>
            {blockedReason}
          </p>
        )}
        {stateError && (
          <Alert tone="red" title="No se pudo cambiar el estado" live>
            {stateError}
          </Alert>
        )}
      </div>

      <Modal
        open={confirmingUnpublish}
        onClose={closeConfirm}
        title="¿Despublicar este artículo?"
        description="Los clientes dejarán de verlo y volverá a ser un borrador. Podrás publicarlo de nuevo cuando quieras."
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirm}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={unpublishing}
              loadingLabel="Despublicando…"
              onClick={() => {
                onUnpublish()
                closeConfirm()
              }}
            >
              Despublicar
            </Button>
          </>
        }
      />
    </section>
  )
}
