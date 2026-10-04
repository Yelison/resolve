import { useId, useState, type ChangeEvent, type DragEvent } from 'react'
import { cx } from '../../../lib/cx'
import { formatBytes } from '../../../lib/format'
import { Icon } from '../Icon/Icon'
import styles from './Upload.module.css'
import { validateFiles } from './validateFiles'

const DEFAULT_ACCEPT = ['image/png', 'image/jpeg', 'application/pdf'] as const
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024

export interface UploadProps {
  /** Recibe solo los archivos válidos; los rechazados se explican bajo la zona. */
  onFiles: (files: File[]) => void
  accept?: readonly string[]
  maxSize?: number
  multiple?: boolean
  disabled?: boolean
  /** Texto de formatos admitidos. */
  hint?: string
  className?: string
}

/** Zona para soltar archivos o elegirlos con el selector nativo, accesible por teclado. */
export function Upload({
  onFiles,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
  multiple = true,
  disabled = false,
  hint = `PNG, JPG, PDF · Hasta ${formatBytes(DEFAULT_MAX_SIZE)}`,
  className,
}: UploadProps) {
  const inputId = useId()
  const errorsId = useId()
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  function handleFiles(list: FileList | null) {
    if (!list || disabled) return
    const files = Array.from(list)
    const result = validateFiles(multiple ? files : files.slice(0, 1), { accept, maxSize })
    if (!multiple && files.length > 1) result.errors.push('Solo se admite un archivo; se usó el primero')
    setErrors(result.errors)
    if (result.accepted.length > 0) onFiles(result.accepted)
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    if (!disabled) setDragging(true)
  }

  function onDragLeave(event: DragEvent<HTMLLabelElement>) {
    // dragleave también se dispara al pasar sobre un hijo; solo cuenta salir de la zona.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    setDragging(false)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files)
    // Permite volver a elegir el mismo archivo después de corregir un error.
    event.target.value = ''
  }

  return (
    <div className={cx(styles.field, className)}>
      <label
        htmlFor={inputId}
        className={cx(
          styles.zone,
          dragging && styles.dragging,
          errors.length > 0 && styles.invalid,
          disabled && styles.disabled,
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          id={inputId}
          type="file"
          className="visually-hidden"
          accept={accept.join(',')}
          multiple={multiple}
          disabled={disabled}
          aria-describedby={errors.length > 0 ? errorsId : undefined}
          aria-invalid={errors.length > 0 || undefined}
          onChange={onChange}
        />
        <Icon name="attach" size={24} className={styles.icon} />
        <span className={styles.title}>
          Arrastra archivos o <span className={styles.link}>selecciona desde tu equipo</span>
        </span>
        <span className={styles.hint}>{hint}</span>
      </label>
      {/* Región persistente: los lectores anuncian mejor el contenido que se añade a una región ya presente. */}
      <div role="alert">
        {errors.length > 0 && (
          <ul id={errorsId} className={styles.errors}>
            {errors.map((error, index) => (
              <li key={`${index}-${error}`}>{error}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
