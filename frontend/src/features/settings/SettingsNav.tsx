import { Link, NavLink } from 'react-router'
import { Icon } from '../../components/ui'
import type { Role } from '../../api/schema'
import { useTheme } from '../../app/theme/useTheme'
import type { ThemePreference } from '../../app/theme/theme'
import { useMe } from '../session/queries'
import { visibleGroups, type SettingsSectionInfo } from './settingsSections'
import styles from './SettingsNav.module.css'

const themeStatus: Record<ThemePreference, string> = {
  light: 'tema claro',
  dark: 'tema oscuro',
  system: 'tema como el sistema',
}

/**
 * Navegación de Configuración desde 768 px: una columna con las secciones del rol, en dos grupos. Cada sección es un
 * enlace (la URL es la sección) y la actual lleva `aria-current`; con `/me` cargando solo hay las del rol con menos
 * permisos, así que nada del personal queda marcado ni se ofrece de más.
 */
export function SettingsNav({ role }: { role: Role | undefined }) {
  return (
    <nav className={styles.nav} aria-label="Secciones de configuración">
      {visibleGroups(role).map((group) => (
        <div key={group.id} className={styles.group}>
          <p className={styles.groupLabel} id={`settings-group-${group.id}`}>
            {group.label}
          </p>
          <ul className={styles.items} aria-labelledby={`settings-group-${group.id}`}>
            {group.sections.map((section) => (
              <li key={section.id}>
                <NavLink to={`/configuracion/${section.id}`} className={styles.item}>
                  <span className={styles.itemLabel}>{section.label}</span>
                  <span className={styles.itemDescription}>{section.description}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/**
 * `/configuracion` por debajo de 768 px: la lista de secciones, cada una una pantalla propia. «General» lleva su estado
 * (quién eres y qué tema usas) en lugar de la descripción fija.
 */
export function SettingsSectionList({ role }: { role: Role | undefined }) {
  const me = useMe()
  const { preference } = useTheme()
  const describe = (section: SettingsSectionInfo) =>
    section.id === 'general' && me.data ? `${me.data.user.name} · ${themeStatus[preference]}` : section.description
  return (
    <nav className={styles.list} aria-label="Secciones de configuración">
      {visibleGroups(role).map((group) => (
        <section key={group.id} className={styles.listGroup} aria-labelledby={`settings-list-${group.id}`}>
          <h2 id={`settings-list-${group.id}`} className={styles.listGroupLabel}>
            {group.label}
          </h2>
          <ul className={styles.listItems}>
            {group.sections.map((section) => (
              <li key={section.id}>
                <Link to={`/configuracion/${section.id}`} className={styles.listItem}>
                  <span className={styles.listText}>
                    <span className={styles.itemLabel}>{section.label}</span>
                    <span className={styles.listDescription}>{describe(section)}</span>
                  </span>
                  <Icon name="chevron" size={20} className={styles.forward} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}
