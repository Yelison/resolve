import { Icon } from '../../components/ui'
import { roleLabels } from '../../app/navigation'
import { accessLabels, groupBySection, matrixRoles, type Access } from './permissions'
import styles from './PermissionsMatrix.module.css'

const sections = groupBySection()
const total = sections.reduce((count, section) => count + section.capabilities.length, 0)

function AccessCell({ access, role }: { access: Access; role: string }) {
  return (
    <td role="cell" className={styles.cell} data-access={access}>
      <span className={styles.role} aria-hidden="true">
        {role}
      </span>
      <span className={styles.value}>
        {access === 'allowed' && <Icon name="check" size={16} />}
        {accessLabels[access]}
      </span>
    </td>
  )
}

/**
 * Matriz informativa de lo que puede hacer cada rol, generada de `permissions.ts`. Por debajo de 640 px de ancho de
 * panel cada capacidad es una tarjeta, agrupadas por sección: ninguna acción se oculta por el ancho. No se guarda
 * nada: los roles son fijos.
 */
export function PermissionsMatrix() {
  return (
    <section className={styles.root} aria-labelledby="permissions-heading">
      <div className={styles.intro}>
        <h2 id="permissions-heading" className={styles.heading}>
          Permisos por rol
        </h2>
        <p className={styles.description}>Qué puede hacer cada rol. Los roles son fijos y no se pueden personalizar.</p>
      </div>
      <div className={styles.panel}>
        <table role="table" className={styles.table} aria-describedby="permissions-caption">
          <caption className="visually-hidden">Capacidades de cada rol</caption>
          <thead role="rowgroup" className={styles.head}>
            <tr role="row">
              <th role="columnheader" scope="col">
                Capacidad
              </th>
              {matrixRoles.map((role) => (
                <th key={role} role="columnheader" scope="col">
                  {roleLabels[role]}
                </th>
              ))}
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.name} role="rowgroup">
              <tr role="row" className={styles.sectionRow}>
                <th role="rowheader" scope="rowgroup" colSpan={matrixRoles.length + 1} className={styles.section}>
                  {section.name}
                </th>
              </tr>
              {section.capabilities.map((capability) => (
                <tr key={capability.key} role="row" className={styles.row}>
                  <th role="rowheader" scope="row" className={styles.capability}>
                    <span className={styles.label}>{capability.label}</span>
                    {capability.note && <span className={styles.note}>{capability.note}</span>}
                  </th>
                  {matrixRoles.map((role) => (
                    <AccessCell key={role} access={capability.access[role]} role={roleLabels[role]} />
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        <p id="permissions-caption" className={styles.caption}>
          Mostrando {total} capacidades
        </p>
      </div>
    </section>
  )
}
