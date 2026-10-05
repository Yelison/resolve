import { useState } from 'react'
import { cx } from '../../../lib/cx'
import styles from './Avatar.module.css'
import { initialsOf } from './initials'

export type AvatarSize = 'small' | 'medium' | 'large'

export interface AvatarProps {
  /** Nombre completo; se usa para las iniciales y como texto alternativo. */
  name: string
  /** Tamaño del avatar; por defecto 'medium' */
  size?: AvatarSize
  /** URL de la imagen; si falta o falla la carga se muestran las iniciales */
  src?: string
  /** Oculta el avatar a lectores de pantalla cuando el nombre ya aparece al lado. */
  decorative?: boolean
  /** Clase adicional para el contenedor */
  className?: string
}

export function Avatar({ name, size = 'medium', src, decorative = false, className }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name }
  return (
    <span className={cx(styles.avatar, styles[size], className)} {...a11y}>
      {src && !imageFailed ? (
        <img className={styles.image} src={src} alt="" onError={() => setImageFailed(true)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}
