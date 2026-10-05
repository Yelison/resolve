import { Link } from 'react-router'
import { cx } from '../../../lib/cx'
import { Avatar } from '../Avatar/Avatar'
import { initialsOf } from '../Avatar/initials'
import { Icon, type IconName } from '../Icon/Icon'
import { NavItem } from '../NavItem/NavItem'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './Sidebar.module.css'

export interface SidebarNavItem {
  /** Ruta a la que navega el elemento. */
  to: string
  /** Texto de la sección; en modo colapsado pasa a aria-label y tooltip. */
  label: string
  /** Icono del elemento. */
  icon: IconName
  /** Marca activa solo la ruta exacta (para la raíz). */
  end?: boolean
}

export interface SidebarAction {
  /** Texto del botón; en modo colapsado pasa a aria-label y tooltip. */
  label: string
  /** Icono del botón. */
  icon: IconName
  /** Se llama al pulsar el botón. */
  onClick: () => void
}

export interface SidebarProps {
  /** Secciones de la navegación principal. */
  items: SidebarNavItem[]
  /** Título visible sobre la lista de secciones; se oculta si el sidebar está colapsado. */
  sectionLabel: string
  /** Nombre del espacio de trabajo; colapsado se muestra solo con sus iniciales. */
  workspace: string
  /** Nombre y rol del perfil que se muestra al final; colapsado solo se ve el avatar. */
  user: { name: string; role: string }
  /** Muestra solo iconos con tooltip. Por defecto, `false`. */
  collapsed?: boolean
  /** Botón inferior: colapsar o expandir en escritorio, cerrar en el drawer móvil. Sin él no se muestra. */
  action?: SidebarAction
  /** Se llama al elegir una sección, p. ej. para cerrar el drawer. */
  onNavigate?: () => void
  /** Clase adicional del contenedor. */
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
