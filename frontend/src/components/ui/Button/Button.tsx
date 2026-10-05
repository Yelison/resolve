import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { buttonClassName, type ButtonStyleOptions } from './buttonClassName'
import { Icon, type IconName } from '../Icon/Icon'
import styles from './Button.module.css'

export interface ButtonProps extends ComponentProps<'button'>, ButtonStyleOptions {
  /** Icono mostrado antes del contenido; se sustituye por un indicador de carga mientras `loading` */
  icon?: IconName
  /** Bloquea nuevas pulsaciones y muestra `loadingLabel` mientras dura la acción. */
  loading?: boolean
  /** Contenido que sustituye al texto del botón mientras `loading`; por defecto «Enviando…» */
  loadingLabel?: ReactNode
}

export function Button({
  variant,
  block,
  className,
  icon,
  loading = false,
  loadingLabel = 'Enviando…',
  type = 'button',
  onClick,
  children,
  ...props
}: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <button
      {...props}
      type={type}
      className={buttonClassName({ variant, block, className })}
      aria-busy={loading || props['aria-busy']}
      aria-disabled={loading || props['aria-disabled']}
      onClick={handleClick}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon && <Icon name={icon} />}
      {loading ? loadingLabel : children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** Icono que se muestra en el botón */
  icon: IconName
  /** Nombre accesible obligatorio: el botón no tiene texto visible. */
  label: string
}

export function IconButton({ icon, label, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} className={cx(styles.iconButton, className)} {...props}>
      <Icon name={icon} />
    </button>
  )
}
