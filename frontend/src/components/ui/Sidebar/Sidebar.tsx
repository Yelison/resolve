import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../../lib/cx'
import { Avatar } from '../Avatar/Avatar'
import { Icon } from '../Icon/Icon'
import { IconButton } from '../Button/Button'
import type { IconName } from '../Icon/Icon'
import { NavItem } from '../NavItem/NavItem'
import { Tooltip } from '../Tooltip/Tooltip'
import { Brand } from './Brand'
import styles from './Sidebar.module.css'
import { WorkspaceMark, type WorkspaceColor } from './WorkspaceMark'

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
  /** Nombre accesible y tooltip del botón. */
  label: string
  /**
   * Qué hace el botón: `collapse` («) y `expand` (») alternan el sidebar de escritorio y llevan `aria-expanded`;
   * `close` (‹) cierra el drawer móvil.
   */
  kind: 'collapse' | 'expand' | 'close'
  /** Se llama al pulsar el botón. */
  onClick: () => void
}

export interface SidebarProfile {
  /** Avatar y, si el sidebar está expandido, nombre y rol. Es decorativo: el control que lo envuelva lleva el nombre accesible. */
  content: ReactNode
  /** Clase de la caja del perfil (tamaño, alineación y, si es un `<button>`, hover y foco). Hay que aplicarla al control. */
  className: string
  /** Si el sidebar está colapsado y el perfil se reduce al avatar. */
  collapsed: boolean
}

export interface SidebarWorkspace {
  /** Cuadro de iniciales y, si el sidebar está expandido, nombre, rol y chevron. Es decorativo: el control lleva el nombre accesible. */
  content: ReactNode
  /** Clase de la tarjeta del espacio (tamaño, alineación, hover y foco). Hay que aplicarla al control. */
  className: string
  /** Si el sidebar está colapsado y la tarjeta se reduce al cuadro de iniciales. */
  collapsed: boolean
}

export interface SidebarProps {
  /** Secciones de la navegación principal. */
  items: SidebarNavItem[]
  /** Título visible sobre la lista de secciones; se oculta si el sidebar está colapsado. */
  sectionLabel: string
  /** Nombre del espacio de trabajo; colapsado se muestra solo con sus iniciales. */
  workspace: string
  /** Color del espacio, que pinta su cuadro de iniciales. Sin él (sesión cargando) el cuadro es neutro. */
  workspaceColor?: WorkspaceColor
  /** Tu rol en el espacio, bajo su nombre. Por defecto, «Espacio de trabajo». Sin rol (sesión cargando) conserva la línea. */
  workspaceRole?: string
  /**
   * Convierte la tarjeta del espacio en el disparador de un selector de espacios (como `profileMenu` con la cuenta). El
   * sidebar no conoce sesiones: la función recibe el contenido y la clase y devuelve el control, que debe medir al
   * menos 44 × 44 px y llevar el nombre accesible del espacio (y, colapsado, un tooltip). Sin esta prop (o con un solo
   * espacio, que no hay a dónde cambiar) la tarjeta es solo texto.
   */
  workspaceMenu?: (workspace: SidebarWorkspace) => ReactNode
  /** Nombre y rol del perfil que se muestra al final; colapsado solo se ve el avatar. */
  user: { name: string; role: string }
  /**
   * Sustituye la caja del perfil por un control propio, p. ej. el menú de la cuenta. El sidebar no conoce sesiones: la
   * función recibe el contenido ya maquetado y la clase, y devuelve el control, que debe medir al menos 44 × 44 px y
   * llevar el nombre accesible de la cuenta (y, colapsado, un tooltip). Sin esta prop se muestra el perfil como texto.
   */
  profileMenu?: (profile: SidebarProfile) => ReactNode
  /** Muestra solo iconos con tooltip. Por defecto, `false`. */
  collapsed?: boolean
  /** Botón de la cabecera, junto a la marca: colapsar o expandir en escritorio, cerrar en el drawer móvil. Sin él no se muestra. */
  action?: SidebarAction
  /** Se llama al elegir una sección, p. ej. para cerrar el drawer. */
  onNavigate?: () => void
  /** Clase adicional del contenedor. */
  className?: string
}

function HeaderAction({ action }: { action: SidebarAction }) {
  return (
    <Tooltip content={action.label} describe={false}>
      {(trigger) => (
        // Doble flecha («) para colapsar, la misma girada («expandir») con `flip`, y una sola para cerrar el drawer.
        <IconButton
          className={styles.toggle}
          icon={action.kind === 'close' ? 'arrow' : ['arrow', 'arrow']}
          flip={action.kind === 'expand'}
          label={action.label}
          aria-expanded={action.kind === 'close' ? undefined : action.kind === 'collapse'}
          onClick={action.onClick}
          {...trigger}
        />
      )}
    </Tooltip>
  )
}

/** Navegación lateral: marca y botón de colapsar arriba, secciones en medio y perfil al final, con scroll interno si falta altura. */
export function Sidebar({
  items,
  sectionLabel,
  workspace,
  workspaceColor,
  workspaceRole = 'Espacio de trabajo',
  workspaceMenu,
  user,
  profileMenu,
  collapsed = false,
  action,
  onNavigate,
  className,
}: SidebarProps) {
  // Con un control propio el avatar es decorativo: el nombre ya va en el control. Sin él, colapsado, es el único nombre.
  const profileContent = (
    <>
      <Avatar name={user.name} decorative={!collapsed || profileMenu !== undefined} />
      {!collapsed && (
        <span className={styles.profileText}>
          <span className={styles.profileName}>{user.name}</span>
          {/* Sin rol (sesión cargando) la línea conserva su altura: el perfil no cambia de tamaño al llegar el rol. */}
          <span className={styles.profileRole}>{user.role || '\u00a0'}</span>
        </span>
      )}
    </>
  )

  const workspaceContent = (
    <>
      <WorkspaceMark
        name={workspace}
        color={workspaceColor}
        size={collapsed ? 'touch' : 'medium'}
        className={cx(!collapsed && styles.cardMark)}
      />
      {!collapsed && (
        <>
          <span className={styles.workspaceText}>
            <span className={styles.workspaceName}>{workspace}</span>
            {/* Sin rol (sesión cargando) la línea conserva su altura: la tarjeta no cambia de tamaño al llegar el rol. */}
            <span className={styles.workspaceKind}>{workspaceRole || '\u00a0'}</span>
          </span>
          {workspaceMenu && <Icon name="chevron" size={16} className={styles.workspaceChevron} />}
        </>
      )}
    </>
  )

  return (
    <div className={cx(styles.sidebar, collapsed && styles.collapsed, className)}>
      <div className={styles.header}>
        <Link to="/" className={styles.brand} aria-label="Resolve, ir al resumen" onClick={onNavigate}>
          <Brand showName={!collapsed} />
        </Link>
        {action && <HeaderAction action={action} />}
      </div>

      {workspaceMenu ? (
        workspaceMenu({ content: workspaceContent, className: cx(styles.workspace), collapsed })
      ) : collapsed ? (
        <span className={styles.workspace} role="img" aria-label={`Espacio de trabajo: ${workspace}`}>
          {workspaceContent}
        </span>
      ) : (
        <div className={styles.workspace}>{workspaceContent}</div>
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

      {profileMenu ? (
        profileMenu({ content: profileContent, className: cx(styles.profile), collapsed })
      ) : (
        <div className={styles.profile}>{profileContent}</div>
      )}
    </div>
  )
}
