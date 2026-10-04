import { Link } from 'react-router'
import { cx } from '../../../lib/cx'
import { Avatar } from '../Avatar/Avatar'
import { initialsOf } from '../Avatar/initials'
import { Icon, type IconName } from '../Icon/Icon'
import { NavItem } from '../NavItem/NavItem'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './Sidebar.module.css'

export interface SidebarNavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

export interface SidebarAction {
  label: string
  icon: IconName
  onClick: () => void
}

export interface SidebarProps {
  items: SidebarNavItem[]
  sectionLabel: string
  workspace: string
  user: { name: string; role: string }
  collapsed?: boolean
  /** Botón inferior: colapsar o expandir en escritorio, cerrar en el drawer móvil. Sin él no se muestra. */
  action?: SidebarAction
  /** Se llama al elegir una sección, p. ej. para cerrar el drawer. */
  onNavigate?: () => void
  className?: string
}

/** Navegación lateral: marca arriba, secciones en medio y perfil al final, con scroll interno si falta altura. */
export function Sidebar({
  items,
  sectionLabel,
  workspace,
  user,
  collapsed = false,
  action,
  onNavigate,
  className,
}: SidebarProps) {
  return (
    <div className={cx(styles.sidebar, collapsed && styles.collapsed, className)}>
      <Link to="/" className={styles.brand} aria-label="Resolve, ir al resumen" onClick={onNavigate}>
        <span className={styles.mark} aria-hidden="true">
          R
        </span>
        {!collapsed && (
          <span className={styles.logo} aria-hidden="true">
            resolve
          </span>
        )}
      </Link>

      {collapsed ? (
        <span className={styles.workspaceInitials} role="img" aria-label={`Espacio de trabajo: ${workspace}`}>
          {initialsOf(workspace)}
        </span>
      ) : (
        <div className={styles.workspace}>
          <span className={styles.workspaceName}>{workspace}</span>
          <span className={styles.workspaceKind}>Espacio de trabajo</span>
        </div>
      )}

      <nav aria-label="Principal" className={styles.navSection}>
        {!collapsed && <p className={styles.sectionLabel}>{sectionLabel}</p>}
        <ul className={styles.nav}>
          {items.map((item) => (
            <li key={item.to}>
              <NavItem {...item} collapsed={collapsed} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.spacer} />

      {action && collapsed && (
        <Tooltip content={action.label} describe={false}>
          {(trigger) => (
            <button
              type="button"
              className={styles.toggle}
              aria-label={action.label}
              onClick={action.onClick}
              {...trigger}
            >
              <Icon name={action.icon} size={22} />
            </button>
          )}
        </Tooltip>
      )}
      {action && !collapsed && (
        <button type="button" className={styles.toggle} onClick={action.onClick}>
          <Icon name={action.icon} size={22} />
          {action.label}
        </button>
      )}

      <div className={styles.profile}>
        <Avatar name={user.name} decorative={!collapsed} />
        {!collapsed && (
          <span className={styles.profileText}>
            <span className={styles.profileName}>{user.name}</span>
            <span className={styles.profileRole}>{user.role}</span>
          </span>
        )}
      </div>
    </div>
  )
}
