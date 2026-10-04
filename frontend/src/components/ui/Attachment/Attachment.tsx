import { cx } from '../../../lib/cx'
import { formatBytes } from '../../../lib/format'
import { Icon } from '../Icon/Icon'
import styles from './Attachment.module.css'

export type AttachmentStatus = 'ready' | 'uploading' | 'error'

export interface AttachmentProps {
  name: string
  size: number
  status?: AttachmentStatus
  /** Progreso de subida de 0 a 100. */
  progress?: number
  /** Enlace de descarga cuando el archivo está listo. */
  href?: string
  onRetry?: () => void
  className?: string
}

export function Attachment({ name, size, status = 'ready', progress = 0, href, onRetry, className }: AttachmentProps) {
  const percent = Math.round(Math.min(Math.max(progress, 0), 100))
  return (
    <div className={cx(styles.attachment, status === 'error' && styles.error, className)}>
      <Icon name="file" className={styles.icon} />
      <div className={styles.file}>
        <span className={styles.name} title={name}>
          {name}
        </span>
        <span className={styles.meta}>
          {status === 'ready' && (
            <>
              {formatBytes(size)}
              {href && (
                <>
                  {' · '}
                  <a className={styles.action} href={href} download={name} aria-label={`Descargar ${name}`}>
                    Descargar
                  </a>
                </>
              )}
            </>
          )}
          {status === 'uploading' && <>Subiendo… {percent} %</>}
          {status === 'error' && (
            <>
              <span className={styles.errorText} role="alert">
                No se pudo subir
              </span>
              {onRetry && (
                <>
                  {' · '}
                  <button type="button" className={styles.action} aria-label={`Reintentar ${name}`} onClick={onRetry}>
                    Reintentar
                  </button>
                </>
              )}
            </>
          )}
        </span>
        {status === 'uploading' && (
          <progress className={styles.progress} max={100} value={percent} aria-label={`Subiendo ${name}`} />
        )}
      </div>
    </div>
  )
}
