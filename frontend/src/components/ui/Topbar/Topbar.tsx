import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../../lib/cx'
import { Avatar } from '../Avatar/Avatar'
import { IconButton } from '../Button/Button'
import { Icon } from '../Icon/Icon'
import styles from './Topbar.module.css'

export interface TopbarMenuButton {
  expanded: boolean
  controls: string
  onClick: () => void
}

export interface TopbarProps {
  /** Ruta de la página; se oculta en la barra móvil. */
  breadcrumb?: ReactNode
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onSearch: () => void
  onNotifications: () => void
  userName: string
  /** Presente en la barra móvil: abre el menú lateral y muestra la marca. */
  menuButton?: TopbarMenuButton
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
  className,
}: TopbarProps) {
  const compact = Boolean(menuButton)

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
        <Avatar name={userName} size={compact ? 'small' : 'medium'} className={styles.avatar} />
      </div>
    </header>
  )
}
