import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router'
import { Breadcrumb, Sidebar, Topbar, useToast } from '../../components/ui'
import { useModalDialog } from '../../components/ui/shared/useModalDialog'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { AccountMenu, AccountMenuPlaceholder } from '../../features/session/AccountMenu'
import { useMe } from '../../features/session/queries'
import { SessionGate } from '../../features/session/SessionGate'
import { useSessionExpiredNotice } from '../../features/session/useSessionExpiredNotice'
import { navigationFor, roleLabels } from '../navigation'
import { SessionErrorPage } from '../pages/SessionErrorPage'
import { useTheme } from '../theme/useTheme'
import styles from './AppShell.module.css'
import { useSidebarPreference } from './useSidebarPreference'

export interface RouteHandle {
  /** Nombre de la página para las migas de pan y el título del documento; puede depender de los parámetros. */
  crumb?: string | ((params: Readonly<Record<string, string | undefined>>) => string)
}

/** Estructura de la aplicación, tras la puerta de sesión: sin sesión (401 en /me) lleva a `/entrar`. */
export function AppShell() {
  return (
    <SessionGate>
      <AppFrame />
    </SessionGate>
  )
}

/**
 * Estructura de la aplicación. El modo lo decide el ancho, nunca el dispositivo:
 * drawer por debajo de 768 px, menú de iconos hasta 1199 px y menú completo (colapsable) desde 1200 px.
 */
function AppFrame() {
  const isTabletUp = useMediaQuery('(min-width: 768px)')
  const isDesktop = useMediaQuery('(min-width: 1200px)')
  const sidebar = useSidebarPreference()
  const theme = useTheme()
  const toast = useToast()
  const drawerId = useId()
  const me = useMe()
  useSessionExpiredNotice()
  // Mientras carga la sesión se muestran marcadores neutros. Si falla, el contenido se sustituye por un aviso con
  // reintento: sin rol, las páginas no pueden decidir qué vista mostrar.
  // Al reintentar, una query sin datos vuelve a «pending» y pierde el error: el aviso se decide por los fallos
  // acumulados y conserva el último error para que ni la página ni su descripción desaparezcan durante el reintento.
  const sessionFailed = !me.data && me.errorUpdateCount > 0
  const [sessionError, setSessionError] = useState<unknown>(null)
  if (me.error && me.error !== sessionError) setSessionError(me.error)
  // Solo se anuncia el fallo del reintento que pidió el usuario (un fallo más que al pulsar); los automáticos, p. ej.
  // al volver la conexión, no.
  const [requestedAt, setRequestedAt] = useState<number | null>(null)
  const workspaceName = me.data?.organization.name ?? 'Resolve'
  const userName = me.data?.user.name ?? '…'
  const [drawerOpen, setDrawerOpen] = useState(false)

  // El drawer solo existe en móvil; al ensanchar la ventana se cierra sin tocar la preferencia de escritorio.
  if (isTabletUp && drawerOpen) setDrawerOpen(false)
  const closeDrawer = () => setDrawerOpen(false)
  const drawerProps = useModalDialog(drawerOpen, closeDrawer)
  const collapsed = isTabletUp && (!isDesktop || sidebar.collapsed)

  // Cada ruta con `crumb` aporta un nivel; los anteriores enlazan a su ruta.
  const crumbs = useMatches().flatMap((match) => {
    const crumb = (match.handle as RouteHandle | undefined)?.crumb
    if (!crumb) return []
    return [{ label: typeof crumb === 'function' ? crumb(match.params) : crumb, to: match.pathname }]
  })
  const crumb = crumbs.at(-1)?.label

  useEffect(() => {
    document.title = crumb ? `${crumb} · Resolve` : 'Resolve'
  }, [crumb])

  // Tras navegar, el foco pasa al contenido para que el teclado y los lectores de pantalla empiecen por la página nueva.
  const location = useLocation()
  const navigate = useNavigate()
  const { pathname } = location
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  useEffect(() => {
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    // Si la navegación pidió enfocar la búsqueda, la página ya movió el foco a su buscador.
    if ((location.state as { focusSearch?: number } | null)?.focusSearch) return
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname, location.state])

  // La búsqueda vive en la bandeja: el atajo lleva allí (conservando sus filtros) y enfoca el buscador.
  const openSearch = useCallback(() => {
    const search = location.pathname === '/tickets' ? location.search : ''
    void navigate({ pathname: '/tickets', search }, { state: { focusSearch: Date.now() } })
  }, [navigate, location.pathname, location.search])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.repeat) {
        event.preventDefault()
        openSearch()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [openSearch])

  const sidebarContent = {
    // Sin sesión no se conoce el rol: ofrecer las secciones del personal llevaría a un cliente a avisos que no puede abrir.
    items: sessionFailed ? [] : navigationFor(me.data?.role),
    sectionLabel: sessionFailed ? 'Sesión no disponible' : me.data?.role === 'customer' ? 'Soporte' : 'Gestión',
    workspace: workspaceName,
    user: { name: userName, role: me.data ? roleLabels[me.data.role] : '' },
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
          onSearch={openSearch}
          onNotifications={() =>
            toast.show({ title: 'Notificaciones no disponibles', description: 'Llegarán con la API de eventos.' })
          }
          userName={userName}
          // Sin la sesión cargada no se ofrece ninguna acción de cuenta, pero el hueco ya tiene el tamaño del botón.
          userMenu={(avatar) =>
            me.data ? <AccountMenu me={me.data} avatar={avatar} /> : <AccountMenuPlaceholder avatar={avatar} />
          }
          breadcrumb={
            <Breadcrumb
              items={[
                { label: workspaceName, to: '/' },
                ...crumbs.map((item, index) => (index === crumbs.length - 1 ? { label: item.label } : item)),
              ]}
            />
          }
          menuButton={
            isTabletUp ? undefined : { expanded: drawerOpen, controls: drawerId, onClick: () => setDrawerOpen(true) }
          }
        />
        <main ref={mainRef} id="contenido" className={styles.content} tabIndex={-1}>
          {sessionFailed ? (
            <SessionErrorPage
              error={sessionError}
              onRetry={() => {
                setRequestedAt(me.errorUpdateCount)
                void me.refetch()
              }}
              retrying={me.fetchStatus !== 'idle'}
              waiting={me.fetchStatus === 'paused'}
              retryFailed={me.fetchStatus === 'idle' && requestedAt !== null && me.errorUpdateCount === requestedAt + 1}
            />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  )
}
