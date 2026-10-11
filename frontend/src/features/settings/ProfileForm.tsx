import { useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router'
import { Alert, Avatar, Button, Input, useToast } from '../../components/ui'
import { isApiError } from '../../api/client'
import type { Me } from '../../api/schema'
import { roleLabels } from '../../app/navigation'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { isLockTimeout, mutationErrorDetail } from '../../lib/mutationError'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { focusField, focusSectionHeading } from './focus'
import { SaveBar } from './SaveBar'
import { SettingsBlock } from './SettingsBlock'
import { useUpdateProfile } from './queries'
import styles from './forms.module.css'

const MAX_NAME = 120

const NAME_HINT = 'Se actualiza en todo el espacio. El historial de actividad conserva el nombre que tenías en cada momento.'

/**
 * Lo que se guarda de General: solo el nombre. Desde 768 px lo guarda la barra de guardar (con «Descartar»); en móvil,
 * donde la barra ocuparía media pantalla, el nombre lleva su propio «Guardar nombre». El correo y el rol se muestran
 * sin control. El tema no es parte de este formulario: se aplica al momento.
 */
export function ProfileForm({ me }: { me: Me }) {
  const update = useUpdateProfile()
  const toast = useToast()
  const isWide = useMediaQuery('(min-width: 768px)')
  const [value, setValue] = useState(me.user.name)
  const [error, setError] = useState<string>()
  const [failure, setFailure] = useState<string | null>(null)
  /** El 503 de bloqueo del último envío (nada se cambió); su aviso ofrece repetir ese mismo envío. */
  const [lockError, setLockError] = useState<unknown>(null)
  const submission = useRepeatableSubmission()
  const formRef = useRef<HTMLFormElement>(null)
  // Si el nombre cambia desde fuera (otra pestaña, relectura de la sesión) y no hay edición en curso, se sigue al servidor.
  const [seenName, setSeenName] = useState(me.user.name)
  if (me.user.name !== seenName) {
    if (value === seenName) setValue(me.user.name)
    setSeenName(me.user.name)
  }

  const trimmed = value.trim()
  const dirty = trimmed !== me.user.name
  const isCustomer = me.role === 'customer'
  const workspace = me.organization.name

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (update.isPending || !dirty) return
    const form = event.currentTarget
    let found: string | undefined
    if (!trimmed) found = 'Escribe tu nombre.'
    else if (trimmed.length > MAX_NAME) found = `Usa como máximo ${MAX_NAME} caracteres.`
    flushSync(() => {
      setError(found)
      setFailure(null)
    })
    if (found) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    // El reintento de un 503 repite este envío con el nombre ya recortado, no lo que haya en el campo entonces.
    setLockError(null)
    submission.send(() => void attempt(form, trimmed))
  }

  async function attempt(form: HTMLFormElement, name: string) {
    try {
      const saved = await update.mutateAsync(name)
      setLockError(null)
      setValue(saved.user.name)
      setSeenName(saved.user.name)
      toast.show({ title: 'Cambios guardados' })
      focusSectionHeading(form)
    } catch (caught) {
      if (isLockTimeout(caught)) {
        setFailure(null)
        setLockError(caught)
      } else if (isApiError(caught, 400)) {
        const message = caught.fieldError('name')
        flushSync(() => {
          setLockError(null)
          setError(message)
          setFailure(message ? null : mutationErrorDetail(caught))
        })
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      } else {
        setLockError(null)
        setFailure(mutationErrorDetail(caught))
      }
    }
  }

  function discard() {
    setValue(me.user.name)
    setError(undefined)
    setFailure(null)
    setLockError(null)
    // «Descartar» queda deshabilitado al no haber cambios: el foco vuelve al campo.
    focusField(formRef.current, 'name')
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-busy={update.isPending}
    >
      <SettingsBlock
        title="Cómo te ve tu equipo"
        description={
          isCustomer
            ? `Así te ve el equipo de soporte de ${workspace} en tus solicitudes.`
            : 'Tu nombre aparece en los tickets, las respuestas y la actividad.'
        }
      >
        <div className={styles.identity}>
          <Avatar name={me.user.name} size="large" decorative />
          <div className={styles.identityText}>
            <span className={styles.identityName}>{me.user.name}</span>
            <span className={styles.identityRole}>
              {isCustomer ? `Cliente de ${workspace}` : `${roleLabels[me.role]} · ${workspace}`}
            </span>
          </div>
        </div>
        <LockTimeoutAlert
          error={lockError}
          pending={update.isPending}
          onRetry={submission.retry}
          what="guardar tu nombre"
        />
        {failure && (
          <Alert tone="red" title="No se pudo guardar tu nombre" live>
            {failure}
          </Alert>
        )}
        <Input
          label="Nombre"
          name="name"
          value={value}
          maxLength={MAX_NAME}
          autoComplete="name"
          onChange={(event) => {
            setValue(event.target.value)
            setError(undefined)
            // El reintento repetiría lo enviado, no lo que se ve ahora: editar retira el aviso de bloqueo.
            setLockError(null)
          }}
          hint={NAME_HINT}
          error={error}
        />
        {!isWide && (
          <Button
            type="submit"
            className={styles.saveName}
            disabled={!dirty}
            loading={update.isPending}
            loadingLabel="Guardando…"
          >
            Guardar nombre
          </Button>
        )}
      </SettingsBlock>
      <SettingsBlock title="Datos de acceso" description="Con este correo entras a Resolve.">
        <dl className={styles.factList}>
          <div className={styles.fact}>
            <dt>Correo</dt>
            <dd>{me.user.email}</dd>
            <dd className={styles.factHint}>Lo gestiona tu inicio de sesión; no se cambia desde aquí.</dd>
          </div>
          <div className={styles.fact}>
            <dt>Rol</dt>
            <dd>
              {isCustomer ? `Cliente de ${workspace}` : roleLabels[me.role]}
              {/* Los clientes no abren Permisos: sin enlace que lleve a un aviso de sin acceso. */}
              {!isCustomer && (
                <>
                  {' · '}
                  <Link to="/configuracion/permisos" className={styles.link}>
                    Ver qué puede hacer
                  </Link>
                </>
              )}
            </dd>
          </div>
        </dl>
      </SettingsBlock>
      {isWide && (
        <SaveBar changed={dirty ? ['Nombre'] : []} pending={update.isPending} onDiscard={discard} />
      )}
    </form>
  )
}
