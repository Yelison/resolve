import { useEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { Tabs, type TabItem } from '../../components/ui'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
import { visibleTabs } from './settingsTabs'
import styles from './SettingsPage.module.css'

/**
 * Configuración: título y pestañas cuya selección vive en la URL (`/configuracion/<pestaña>`), así que se pueden
 * enlazar y el botón Atrás funciona. Cada pestaña es un formulario independiente con su propio «Guardar cambios».
 */
export function SettingsPage() {
  const me = useMe()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = pathname.split('/')[2]
  const tabsRef = useRef<HTMLDivElement>(null)
  /** Se activó una pestaña con teclado o puntero: tras la navegación el foco debe seguir en ella. */
  const keepTabFocus = useRef(false)

  // El shell lleva el foco al contenido en cada cambio de ruta, y su efecto corre después que el nuestro dentro del
  // mismo commit. Con las flechas el foco debe quedarse en la pestaña, así que se devuelve cuando el shell ya terminó.
  useEffect(() => {
    if (!keepTabFocus.current) return
    keepTabFocus.current = false
    const timer = window.setTimeout(() =>
      tabsRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus(),
    )
    return () => window.clearTimeout(timer)
  }, [pathname])
  const items: TabItem[] = visibleTabs(me.data?.role).map((tab) => ({
    id: tab.id,
    label: tab.label,
    content: <Outlet />,
  }))

  return (
    <div className={pageStyles.page}>
      <PageHeader title="Configuración" description="Personaliza tu espacio y tus preferencias." />
      <div ref={tabsRef} className={styles.tabs}>
        <Tabs
          label="Secciones de configuración"
          items={items}
          value={active}
          onChange={(id) => {
            keepTabFocus.current = true
            void navigate(`/configuracion/${id}`, { replace: true })
          }}
        />
      </div>
    </div>
  )
}

/** `/configuracion` abre la primera pestaña del rol: Empresa para el personal, Perfil para un cliente. */
export function SettingsIndex() {
  const me = useMe()
  if (me.isPending) return null
  return <Navigate to={me.data?.role === 'customer' ? 'perfil' : 'empresa'} replace />
}
