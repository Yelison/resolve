import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../../lib/cx'
import { Avatar } from '../Avatar/Avatar'
import { IconButton } from '../Button/Button'
import { Icon } from '../Icon/Icon'
import styles from './Topbar.module.css'

export interface TopbarMenuButton {
  /** Indica si el menú lateral está abierto (aria-expanded). */
  expanded: boolean
  /** Id del menú lateral que controla el botón (aria-controls). */
  controls: string
  /** Se llama al pulsar el botón. */
  onClick: () => void
}

export interface TopbarProps {
  /** Ruta de la página; se oculta en la barra móvil. */
  breadcrumb?: ReactNode
  /** Tema activo; determina el icono y la etiqueta del botón de tema. */
  theme: 'light' | 'dark'
  /** Se llama al pulsar el botón de tema. */
  onToggleTheme: () => void
  /** Se llama al pulsar el botón de búsqueda; no se muestra en la barra móvil. */
  onSearch: () => void
  /** Se llama al pulsar el botón de notificaciones; no se muestra en la barra móvil. */
  onNotifications: () => void
  /** Nombre del usuario para el avatar. */
  userName: string
  /** Presente en la barra móvil: abre el menú lateral y muestra la marca. */
  menuButton?: TopbarMenuButton
  /**
   * Sustituye al avatar por un control propio, p. ej. el menú de la cuenta. Recibe el avatar ya dimensionado y
   * decorativo (sin nombre accesible propio) para usarlo como contenido; el control que lo envuelve debe llevar su
   * nombre accesible y medir al menos 44 × 44 px. Sin esta prop se muestra el avatar, como siempre.
   */
  userMenu?: (avatar: ReactNode) => ReactNode
  /** Clase adicional del encabezado. */
  className?: string
}

/** El atajo se muestra con la tecla de cada sistema; el manejador acepta Ctrl y ⌘ en ambos. */
const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'

export function Topbar({
  breadcrumb,
  theme,
  onToggleTheme,
  onSearch,
  onNotifications,
  userName,
  menuButton,
  userMenu,
  className,
}: TopbarProps) {
  const compact = Boolean(menuButton)
  const avatarSize = compact ? 'small' : 'medium'

  return (
    <header className={cx(styles.topbar, className)}>
      <div className={styles.start}>
        {menuButton ? (
          <>
            <IconButton
              icon="menu"
              label="Abrir menú"
              aria-expanded={menuButton.expanded}
              aria-controls={menuButton.controls}
              onClick={menuButton.onClick}
            />
            <Link to="/" className={styles.logo}>
              resolve
            </Link>
          </>
        ) : (
          breadcrumb
        )}
      </div>
      <div className={styles.actions}>
        {!compact && (
          <button type="button" className={styles.search} onClick={onSearch} aria-keyshortcuts="Control+K Meta+K">
            <Icon name="search" />
            Buscar…<kbd className={styles.shortcut}>{shortcutLabel}</kbd>
          </button>
        )}
        <IconButton
          icon={theme === 'dark' ? 'sun' : 'moon'}
          label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          onClick={onToggleTheme}
        />
        {!compact && <IconButton icon="bell" label="Notificaciones" onClick={onNotifications} />}
        {userMenu ? (
          <span className={styles.account}>{userMenu(<Avatar name={userName} size={avatarSize} decorative />)}</span>
        ) : (
          <Avatar name={userName} size={avatarSize} className={styles.avatar} />
        )}
      </div>
    </header>
  )
}
