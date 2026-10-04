import { NavLink } from 'react-router'
import { cx } from '../../../lib/cx'
import { Icon, type IconName } from '../Icon/Icon'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './NavItem.module.css'

export interface NavItemProps {
  to: string
  label: string
  icon: IconName
  /** Solo icono, con el nombre en aria-label y en un tooltip visible con puntero y foco. */
  collapsed?: boolean
  /** Marca activa solo la ruta exacta (para la raíz). */
  end?: boolean
  onNavigate?: () => void
}

export function NavItem({ to, label, icon, collapsed = false, end, onNavigate }: NavItemProps) {
  const className = ({ isActive }: { isActive: boolean }) =>
    cx(styles.item, collapsed && styles.collapsed, isActive && styles.active)

  if (!collapsed) {
    return (
      <NavLink to={to} end={end} className={className} onClick={onNavigate}>
        <Icon name={icon} className={styles.icon} />
        <span className={styles.label}>{label}</span>
      </NavLink>
    )
  }

  return (
    <Tooltip content={label} describe={false}>
      {(trigger) => (
        <NavLink to={to} end={end} aria-label={label} className={className} onClick={onNavigate} {...trigger}>
          <Icon name={icon} className={styles.icon} />
        </NavLink>
      )}
    </Tooltip>
  )
}
