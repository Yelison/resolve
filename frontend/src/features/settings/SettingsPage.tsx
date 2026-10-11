import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { Icon } from '../../components/ui'
import { PageHeader } from '../../app/pages/PageHeader'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { useMe } from '../session/queries'
import { SettingsNav, SettingsSectionList } from './SettingsNav'
import { defaultSection, findSection } from './settingsSections'
import styles from './SettingsPage.module.css'

/** Desde este ancho las secciones van en una columna al lado; por debajo, la lista y cada sección son pantallas propias. */
const WIDE = '(min-width: 768px)'

/**
 * Configuración: la sección vive en la URL (`/configuracion/<sección>`), así que se puede enlazar y Atrás funciona.
 * Desde 768 px las secciones van en una columna lateral con el contenido a la derecha; por debajo, `/configuracion` es
 * la lista y cada sección una pantalla con «‹ Configuración». Cada sección con campos lleva su propia barra de guardar.
 */
export function SettingsPage() {
  const me = useMe()
  const isWide = useMediaQuery(WIDE)
  const { pathname } = useLocation()
  const section = findSection(pathname.split('/')[2])

  if (isWide) {
    return (
      <div className={styles.layout}>
        <div className={styles.side}>
          <h1 className={styles.title}>Configuración</h1>
          <SettingsNav role={me.data?.role} />
        </div>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    )
  }
  return (
    <div className={styles.page}>
      {section ? (
        <>
          <Link to="/configuracion" className={styles.back}>
            <Icon name="chevron" size={20} className={styles.backIcon} />
            Configuración
          </Link>
          <h1 className={styles.sectionTitle}>{section.label}</h1>
        </>
      ) : (
        <PageHeader title="Configuración" />
      )}
      <Outlet />
    </div>
  )
}

/**
 * `/configuracion` sin sección: en pantallas anchas abre la primera del rol (Empresa para el personal, General para un
 * cliente); en móvil es la lista de secciones.
 */
export function SettingsIndex() {
  const me = useMe()
  const isWide = useMediaQuery(WIDE)
  if (!isWide) return <SettingsSectionList role={me.data?.role} />
  if (me.isPending) return null
  return <Navigate to={defaultSection(me.data?.role)} replace />
}
