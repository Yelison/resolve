import { useId, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { useModalDialog } from '../shared/useModalDialog'
import styles from './Modal.module.css'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  /** Acciones al pie, normalmente Button secundario y principal. */
  footer?: ReactNode
  size?: 'default' | 'wide'
  className?: string
  children?: ReactNode
}

/** Diálogo modal sobre <dialog>: foco atrapado, Escape, clic en el fondo y foco devuelto al cerrar. */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'default',
  className,
  children,
}: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogProps = useModalDialog(open, onClose)

  return (
    <dialog
      {...dialogProps}
      className={cx(styles.modal, size === 'wide' && styles.wide, className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      {open && (
        <div className={styles.content}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          )}
          {children}
          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
