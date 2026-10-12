import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Input, Select, useToast } from '../../components/ui'
import { WorkspaceMark } from '../../components/ui/Sidebar/WorkspaceMark'
import { isApiError } from '../../api/client'
import type { OrganizationColor, OrganizationPatch, OrganizationSettings } from '../../api/schema'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { isLockTimeout, mutationErrorDetail } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { focusField, focusSectionHeading } from './focus'
import { SaveBar } from './SaveBar'
import { SettingsBlock } from './SettingsBlock'
import { timeZoneGroups, timeZoneLabel } from './timeZones'
import { useUpdateOrganization } from './queries'
import { WorkspaceColorField } from './WorkspaceColorField'
import { workspaceColorLabel } from './workspaceColors'
import { useMe } from '../session/queries'
import { workspaceCardRole } from '../session/workspaces'
import styles from './forms.module.css'

const MAX_NAME = 120
const MAX_EMAIL = 254
const MIN_TARGET = 1
const MAX_TARGET = 1440
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldName = 'name' | 'supportEmail' | 'timeZone' | 'firstResponseTargetMinutes' | 'color'
type Values = Record<FieldName, string>
type Errors = Partial<Record<FieldName, string>>

const fieldNames: readonly FieldName[] = ['name', 'color', 'supportEmail', 'timeZone', 'firstResponseTargetMinutes']
const fieldLabels: Record<FieldName, string> = {
  name: 'Nombre del espacio',
  supportEmail: 'Correo de soporte',
  timeZone: 'Zona horaria',
  firstResponseTargetMinutes: 'Objetivo de primera respuesta',
  color: 'Color',
}

const toValues = (settings: OrganizationSettings): Values => ({
  name: settings.name,
  supportEmail: settings.supportEmail ?? '',
  timeZone: settings.timeZone,
  firstResponseTargetMinutes: String(settings.firstResponseTargetMinutes),
  color: settings.color,
})

/** Cómo ve la persona el valor de un campo (la zona con su ciudad y su desfase). */
const display = (field: FieldName, value: string) =>
  field === 'timeZone'
    ? timeZoneLabel(value)
    : field === 'firstResponseTargetMinutes'
      ? `${value} min`
      : field === 'color'
        ? workspaceColorLabel(value)
        : value || 'vacío'

/** Un número escrito como «030» es el mismo que 30: no cuenta como cambio. */
const sameValue = (field: FieldName, a: string, b: string) =>
  field === 'firstResponseTargetMinutes' && /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) === Number(b) : a === b

function validate(values: Values): Errors {
  const found: Errors = {}
  if (!values.name) found.name = 'Escribe el nombre del espacio.'
  else if (values.name.length > MAX_NAME) found.name = `Usa como máximo ${MAX_NAME} caracteres.`
  if (values.supportEmail && !EMAIL_PATTERN.test(values.supportEmail)) {
    found.supportEmail = 'Escribe un correo válido, como soporte@empresa.com.'
  } else if (values.supportEmail.length > MAX_EMAIL) {
    found.supportEmail = `Usa como máximo ${MAX_EMAIL} caracteres.`
  }
  const target = Number(values.firstResponseTargetMinutes)
  if (!/^\d+$/.test(values.firstResponseTargetMinutes) || target < MIN_TARGET || target > MAX_TARGET) {
    found.firstResponseTargetMinutes = `Escribe un número entero de minutos entre ${MIN_TARGET} y ${MAX_TARGET}.`
  }
  return found
}

type Failure = { kind: 'conflict' } | { kind: 'error'; detail: string } | null

/**
 * Formulario de la organización (admin). Es persistente, no un diálogo: tras guardar se queda con los valores del
 * servidor y «Guardar cambios» vuelve a deshabilitarse. Solo viajan los campos cambiados (`supportEmail` vacío viaja
 * como `null`); si llega una versión nueva (p. ej. tras un 412) los campos no tocados toman el valor del servidor y los
 * tocados conservan lo escrito.
 */
export function OrganizationForm({
  settings,
  responseMinutes,
}: {
  settings: OrganizationSettings
  /** Mediana real de primera respuesta; `null` si aún no hay respuestas y `undefined` mientras se desconoce. */
  responseMinutes?: number | null
}) {
  const update = useUpdateOrganization()
  const me = useMe()
  const role = me.data ? workspaceCardRole(me.data.role) : ''
  const toast = useToast()
  const source = toValues(settings)
  const [values, setValues] = useState<Values>(source)
  // Valor del servidor con el que se empezó a editar cada campo: «Ahora: …» avisa si cambió desde entonces.
  const [base, setBase] = useState<Values>(source)
  const [seenVersion, setSeenVersion] = useState(settings.version)
  const [serverChanged, setServerChanged] = useState<FieldName[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<Failure>(null)
  /** El 503 de bloqueo del último envío (nada se cambió); su aviso ofrece repetir ese mismo envío. */
  const [lockError, setLockError] = useState<unknown>(null)
  const submission = useRepeatableSubmission()
  const alerts = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const groups = useMemo(() => timeZoneGroups(settings.timeZone), [settings.timeZone])

  if (settings.version > seenVersion) {
    setSeenVersion(settings.version)
    setServerChanged(fieldNames.filter((field) => source[field] !== base[field]))
    const nextValues = { ...values }
    const nextBase = { ...base }
    for (const field of fieldNames) {
      // Sin tocar, o ya igual a lo que dice el servidor (p. ej. tras guardar): pasa a ser el valor del servidor.
      if (values[field] === base[field] || sameValue(field, values[field].trim(), source[field])) {
        nextValues[field] = source[field]
        nextBase[field] = source[field]
      }
    }
    setValues(nextValues)
    setBase(nextBase)
  }

  const changed = fieldNames.filter((field) => !sameValue(field, values[field].trim(), source[field]))
  const serverNote = (field: FieldName) =>
    changed.includes(field) && source[field] !== base[field] ? `Ahora: ${display(field, source[field])}` : undefined

  function change(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    // El reintento repetiría lo enviado, no lo que se ve ahora: editar retira el aviso de bloqueo.
    setLockError(null)
  }

  // La barra de guardar está abajo y los avisos arriba: al aparecer uno se lleva a la vista.
  const alertKey = lockError ? 'lock' : (failure?.kind ?? '')
  useEffect(() => {
    if (alertKey) alerts.current?.scrollIntoView?.({ block: 'nearest' })
  }, [alertKey])

  function discard() {
    const first = changed[0]
    // flushSync: en un grupo de radios (el color) el foco va a la opción que queda marcada, que solo existe tras pintar.
    flushSync(() => {
      setValues(source)
      setBase(source)
      setServerChanged([])
      setErrors({})
      setFailure(null)
      setLockError(null)
    })
    // «Descartar» queda deshabilitado al no haber cambios: el foco va al primer campo que se descartó.
    if (first) focusField(formRef.current, first)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Segunda barrera: el botón en carga ya bloquea el clic, pero no el envío con Enter.
    if (update.isPending || changed.length === 0) return
    const form = event.currentTarget
    const trimmed: Values = {
      name: values.name.trim(),
      supportEmail: values.supportEmail.trim(),
      timeZone: values.timeZone,
      firstResponseTargetMinutes: values.firstResponseTargetMinutes.trim(),
      color: values.color,
    }
    const found = validate(trimmed)
    // flushSync pinta los errores antes de mover el foco al primer campo inválido.
    flushSync(() => {
      setErrors(found)
      setFailure(null)
    })
    if (Object.keys(found).length > 0) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    const changes: OrganizationPatch = {}
    if (changed.includes('name')) changes.name = trimmed.name
    if (changed.includes('supportEmail')) changes.supportEmail = trimmed.supportEmail || null
    if (changed.includes('timeZone')) changes.timeZone = trimmed.timeZone
    if (changed.includes('firstResponseTargetMinutes')) {
      changes.firstResponseTargetMinutes = Number(trimmed.firstResponseTargetMinutes)
    }
    if (changed.includes('color')) changes.color = trimmed.color as OrganizationColor
    // El reintento de un 503 repite este envío con su versión: si otra persona guardó entretanto, responde el 412.
    setLockError(null)
    submission.send(() => void attempt(form, { version: settings.version, changes }))
  }

  async function attempt(form: HTMLFormElement, variables: { version: number; changes: OrganizationPatch }) {
    try {
      const saved = await update.mutateAsync(variables)
      setLockError(null)
      const next = toValues(saved)
      setValues(next)
      setBase(next)
      setSeenVersion(saved.version)
      setServerChanged([])
      toast.show({ title: 'Cambios guardados' })
      focusSectionHeading(form)
    } catch (error) {
      if (isLockTimeout(error)) {
        setFailure(null)
        setLockError(error)
      } else if (isApiError(error, 412)) {
        setLockError(null)
        setFailure({ kind: 'conflict' })
      } else if (isApiError(error, 400)) {
        const serverErrors: Errors = {}
        for (const field of fieldNames) {
          const message = error.fieldError(field)
          if (message) serverErrors[field] = message
        }
        flushSync(() => {
          setLockError(null)
          setErrors(serverErrors)
          setFailure(
            Object.keys(serverErrors).length > 0 ? null : { kind: 'error', detail: mutationErrorDetail(error) },
          )
        })
        // El primer campo con error, en el orden del formulario; el grupo de color lleva el foco a su muestra marcada.
        const invalid = fieldNames.find((field) => serverErrors[field])
        if (invalid) focusField(form, invalid)
      } else {
        setLockError(null)
        setFailure({ kind: 'error', detail: mutationErrorDetail(error) })
      }
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-busy={update.isPending}
    >
      <div ref={alerts} className={styles.alerts}>
        <LockTimeoutAlert
          error={lockError}
          pending={update.isPending}
          onRetry={submission.retry}
          what="guardar los ajustes de la empresa"
        />
        {failure?.kind === 'conflict' && (
          <Alert tone="amber" title="Los ajustes cambiaron mientras los editabas" live>
            Otra persona los actualizó y ya cargamos la versión actual.
            {serverChanged.length > 0 && ` Cambió: ${serverChanged.map((field) => fieldLabels[field]).join(', ')}.`} Tus
            cambios siguen aquí: revisa y vuelve a guardar.
          </Alert>
        )}
        {failure?.kind === 'error' && (
          <Alert tone="red" title="No se pudieron guardar los ajustes de la empresa" live>
            {failure.detail}
          </Alert>
        )}
      </div>
      <SettingsBlock title="Identidad" description="Cómo ven tu espacio tu equipo y tus clientes.">
        <Input
          label={fieldLabels.name}
          name="name"
          value={values.name}
          maxLength={MAX_NAME}
          autoComplete="organization"
          onChange={(event) => change('name', event.target.value)}
          hint={serverNote('name')}
          error={errors.name}
        />
        <WorkspaceColorField
          value={values.color as OrganizationColor}
          name={values.name.trim()}
          role={role}
          onChange={(color) => change('color', color)}
          hint={serverNote('color')}
          error={errors.color}
        />
        <Input
          label={fieldLabels.supportEmail}
          name="supportEmail"
          type="email"
          value={values.supportEmail}
          maxLength={MAX_EMAIL}
          autoComplete="off"
          onChange={(event) => change('supportEmail', event.target.value)}
          hint={serverNote('supportEmail') ?? 'Opcional. Lo verán tus clientes en los artículos de ayuda.'}
          error={errors.supportEmail}
        />
      </SettingsBlock>
      <SettingsBlock
        title="Horario y objetivos"
        description="Las fechas, el «hoy» de las métricas y los reportes usan esta zona horaria."
      >
        <div className={styles.pair}>
          <Select
            label={fieldLabels.timeZone}
            name="timeZone"
            value={values.timeZone}
            onChange={(event) => change('timeZone', event.target.value)}
            hint={serverNote('timeZone')}
            error={errors.timeZone}
          >
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Input
            label={fieldLabels.firstResponseTargetMinutes}
            name="firstResponseTargetMinutes"
            inputMode="numeric"
            value={values.firstResponseTargetMinutes}
            autoComplete="off"
            onChange={(event) => change('firstResponseTargetMinutes', event.target.value)}
            hint={
              <>
                {serverNote('firstResponseTargetMinutes') ?? `De ${MIN_TARGET} a ${MAX_TARGET} minutos.`}
                <ResponseNow minutes={responseMinutes} />
              </>
            }
            error={errors.firstResponseTargetMinutes}
          />
        </div>
      </SettingsBlock>
      <SaveBar changed={changed.map((field) => fieldLabels[field])} pending={update.isPending} onDiscard={discard} />
    </form>
  )
}

/**
 * «Ahora respondes en 18 min»: la mediana real de primera respuesta, junto al objetivo. La línea se reserva desde el
 * principio (también si el dato no llega) para que el formulario no se mueva al llegar.
 */
export function ResponseNow({ minutes }: { minutes?: number | null }) {
  return (
    <span className={styles.nowLine}>
      {minutes === undefined
        ? ''
        : minutes === null
          ? 'Todavía no hay respuestas de la última semana.'
          : `Ahora respondes en ${minutes} min.`}
    </span>
  )
}

/** Vista de solo lectura de los ajustes, para el agente: no ve controles que no puede usar. */
export function OrganizationFacts({
  settings,
  responseMinutes,
}: {
  settings: OrganizationSettings
  responseMinutes?: number | null
}) {
  const fact = (label: string, value: string, extra?: ReactNode) => (
    <div className={styles.readFact}>
      <dt>{label}</dt>
      <dd>
        {value}
        {extra}
      </dd>
    </div>
  )
  return (
    <div className={styles.facts}>
      <Alert tone="blue" title="Solo un administrador puede cambiar los datos de la empresa." />
      <SettingsBlock title="Identidad" description="Cómo ven tu espacio tu equipo y tus clientes.">
        <dl className={styles.factList}>
          {fact(fieldLabels.name, settings.name)}
          <div className={styles.readFact}>
            <dt>{fieldLabels.color}</dt>
            <dd className={styles.colorFact}>
              <WorkspaceMark name={settings.name} color={settings.color} size="small" />
              {workspaceColorLabel(settings.color)}
            </dd>
          </div>
          {fact(fieldLabels.supportEmail, settings.supportEmail ?? 'Sin configurar')}
        </dl>
      </SettingsBlock>
      <SettingsBlock
        title="Horario y objetivos"
        description="Las fechas, el «hoy» de las métricas y los reportes usan esta zona horaria."
      >
        <dl className={styles.factList}>
          {fact(fieldLabels.timeZone, timeZoneLabel(settings.timeZone))}
          {fact(
            fieldLabels.firstResponseTargetMinutes,
            `${settings.firstResponseTargetMinutes} minutos`,
            <ResponseNow minutes={responseMinutes} />,
          )}
        </dl>
      </SettingsBlock>
    </div>
  )
}
