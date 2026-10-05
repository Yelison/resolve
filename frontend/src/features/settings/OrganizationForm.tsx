import { useMemo, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Button, Input, Select, useToast } from '../../components/ui'
import { isApiError } from '../../api/client'
import type { OrganizationPatch, OrganizationSettings } from '../../api/schema'
import { mutationErrorDetail } from '../../lib/mutationError'
import { focusSectionHeading } from './focus'
import { timeZoneGroups } from './timeZones'
import { useUpdateOrganization } from './queries'
import styles from './forms.module.css'

const MAX_NAME = 120
const MAX_EMAIL = 254
const MIN_TARGET = 1
const MAX_TARGET = 1440
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldName = 'name' | 'supportEmail' | 'timeZone' | 'firstResponseTargetMinutes'
type Values = Record<FieldName, string>
type Errors = Partial<Record<FieldName, string>>

const fieldNames: readonly FieldName[] = ['name', 'supportEmail', 'timeZone', 'firstResponseTargetMinutes']
const fieldLabels: Record<FieldName, string> = {
  name: 'Nombre del espacio',
  supportEmail: 'Correo de soporte',
  timeZone: 'Zona horaria',
  firstResponseTargetMinutes: 'Objetivo de primera respuesta',
}

const toValues = (settings: OrganizationSettings): Values => ({
  name: settings.name,
  supportEmail: settings.supportEmail ?? '',
  timeZone: settings.timeZone,
  firstResponseTargetMinutes: String(settings.firstResponseTargetMinutes),
})

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
export function OrganizationForm({ settings }: { settings: OrganizationSettings }) {
  const update = useUpdateOrganization()
  const toast = useToast()
  const source = toValues(settings)
  const [values, setValues] = useState<Values>(source)
  // Valor del servidor con el que se empezó a editar cada campo: «Ahora: …» avisa si cambió desde entonces.
  const [base, setBase] = useState<Values>(source)
  const [seenVersion, setSeenVersion] = useState(settings.version)
  const [serverChanged, setServerChanged] = useState<FieldName[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<Failure>(null)
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
    changed.includes(field) && source[field] !== base[field] ? `Ahora: ${source[field] || 'vacío'}` : undefined

  function change(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
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
    try {
      const saved = await update.mutateAsync({ version: settings.version, changes })
      const next = toValues(saved)
      setValues(next)
      setBase(next)
      setSeenVersion(saved.version)
      setServerChanged([])
      toast.show({ title: 'Cambios guardados' })
      focusSectionHeading(form)
    } catch (error) {
      if (isApiError(error, 412)) {
        setFailure({ kind: 'conflict' })
      } else if (isApiError(error, 400)) {
        const serverErrors: Errors = {}
        for (const field of fieldNames) {
          const message = error.fieldError(field)
          if (message) serverErrors[field] = message
        }
        flushSync(() => {
          setErrors(serverErrors)
          setFailure(
            Object.keys(serverErrors).length > 0 ? null : { kind: 'error', detail: mutationErrorDetail(error) },
          )
        })
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      } else {
        setFailure({ kind: 'error', detail: mutationErrorDetail(error) })
      }
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate aria-busy={update.isPending}>
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
      <Input
        label={fieldLabels.name}
        value={values.name}
        maxLength={MAX_NAME}
        autoComplete="organization"
        onChange={(event) => change('name', event.target.value)}
        hint={serverNote('name')}
        error={errors.name}
      />
      <Input
        label={fieldLabels.supportEmail}
        type="email"
        value={values.supportEmail}
        maxLength={MAX_EMAIL}
        autoComplete="off"
        onChange={(event) => change('supportEmail', event.target.value)}
        hint={serverNote('supportEmail') ?? 'Opcional. Se muestra en el pie de la base de conocimiento.'}
        error={errors.supportEmail}
      />
      <Select
        label={fieldLabels.timeZone}
        value={values.timeZone}
        onChange={(event) => change('timeZone', event.target.value)}
        hint={serverNote('timeZone') ?? 'Las fechas, el «hoy» de las métricas y los reportes se calculan en esta zona.'}
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
        inputMode="numeric"
        value={values.firstResponseTargetMinutes}
        autoComplete="off"
        onChange={(event) => change('firstResponseTargetMinutes', event.target.value)}
        hint={
          serverNote('firstResponseTargetMinutes') ??
          `En minutos, de ${MIN_TARGET} a ${MAX_TARGET}. Es la referencia del resumen y de los reportes.`
        }
        error={errors.firstResponseTargetMinutes}
      />
      <div className={styles.actions}>
        <Button type="submit" disabled={changed.length === 0} loading={update.isPending} loadingLabel="Guardando…">
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}

/** Vista de solo lectura de los ajustes, para el agente: no ve controles que no puede usar. */
export function OrganizationFacts({ settings }: { settings: OrganizationSettings }) {
  const facts: [string, string][] = [
    [fieldLabels.name, settings.name],
    [fieldLabels.supportEmail, settings.supportEmail ?? 'Sin configurar'],
    [fieldLabels.timeZone, settings.timeZone],
    [fieldLabels.firstResponseTargetMinutes, `${settings.firstResponseTargetMinutes} min`],
  ]
  return (
    <dl className={styles.facts}>
      {facts.map(([label, value]) => (
        <div key={label} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
