import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router'
import { Breadcrumb, Sidebar, Topbar, useToast } from '../../components/ui'
import { useModalDialog } from '../../components/ui/shared/useModalDialog'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { demoSession, mainNavigation } from '../navigation'
import { useTheme } from '../theme/useTheme'
import styles from './AppShell.module.css'
import { useSidebarPreference } from './useSidebarPreference'

export interface RouteHandle {
  /** Nombre de la página para las migas de pan y el título del documento. */
  crumb?: string
}

/**
 * Estructura de la aplicación. El modo lo decide el ancho, nunca el dispositivo:
 * drawer por debajo de 768 px, menú de iconos hasta 1199 px y menú completo (colapsable) desde 1200 px.
 */
export function AppShell() {
  const isTabletUp = useMediaQuery('(min-width: 768px)')
  const isDesktop = useMediaQuery('(min-width: 1200px)')
  const sidebar = useSidebarPreference()
  const theme = useTheme()
  const toast = useToast()
  const drawerId = useId()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // El drawer solo existe en móvil; al ensanchar la ventana se cierra sin tocar la preferencia de escritorio.
  if (isTabletUp && drawerOpen) setDrawerOpen(false)
  const closeDrawer = () => setDrawerOpen(false)
  const drawerProps = useModalDialog(drawerOpen, closeDrawer)
  const collapsed = isTabletUp && (!isDesktop || sidebar.collapsed)

  const crumb = useMatches()
    .map((match) => (match.handle as RouteHandle | undefined)?.crumb)
    .filter(Boolean)
    .at(-1)

  useEffect(() => {
    document.title = crumb ? `${crumb} · Resolve` : 'Resolve'
  }, [crumb])

  // Tras navegar, el foco pasa al contenido para que el teclado y los lectores de pantalla empiecen por la página nueva.
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  useEffect(() => {
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  const showPendingSearch = useCallback(
    () =>
      toast.show({
        title: 'Búsqueda no disponible',
        description: 'Se activará cuando la API de tickets esté conectada.',
      }),
    [toast],
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.repeat) {
        event.preventDefault()
        showPendingSearch()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showPendingSearch])

  const sidebarContent = {
    items: mainNavigation,
    sectionLabel: 'Gestión',
    workspace: demoSession.workspace,
    user: demoSession.user,
  }

  return (
    <div className={styles.shell}>
      <a href="#contenido" className={styles.skipLink}>
        Saltar al contenido
      </a>

      {isTabletUp ? (
        <div className={styles.aside}>
          <Sidebar
            {...sidebarContent}
            collapsed={collapsed}
            action={
              isDesktop
                ? {
                    label: sidebar.collapsed ? 'Expandir menú' : 'Colapsar menú',
                    icon: sidebar.collapsed ? 'expand' : 'collapse',
                    onClick: sidebar.toggle,
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <dialog {...drawerProps} id={drawerId} className={styles.drawer} aria-label="Menú principal">
          {drawerOpen && (
            <Sidebar
              {...sidebarContent}
              className={styles.drawerSidebar}
              action={{ label: 'Cerrar menú', icon: 'collapse', onClick: closeDrawer }}
              onNavigate={closeDrawer}
            />
          )}
        </dialog>
      )}

      <div className={styles.main}>
        <Topbar
          theme={theme.resolved}
          onToggleTheme={theme.toggle}
          onSearch={showPendingSearch}
          onNotifications={() =>
            toast.show({ title: 'Notificaciones no disponibles', description: 'Llegarán con la API de eventos.' })
          }
          userName={demoSession.user.name}
          breadcrumb={
            <Breadcrumb items={[{ label: demoSession.workspace, to: '/' }, ...(crumb ? [{ label: crumb }] : [])]} />
          }
          menuButton={
            isTabletUp ? undefined : { expanded: drawerOpen, controls: drawerId, onClick: () => setDrawerOpen(true) }
          }
        />
        <main ref={mainRef} id="contenido" className={styles.content} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
