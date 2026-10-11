import { useId, useState } from 'react'
import { Icon } from '../../components/ui'
import { useElementWidth } from '../../components/ui/shared/useElementWidth'
import { cx } from '../../lib/cx'
import { useMediaQuery } from '../../lib/useMediaQuery'
import type { Role } from '../../api/schema'
import { roleLabels } from '../../app/navigation'
import { useMe } from '../session/queries'
import {
  accessLabels,
  accessStatus,
  groupBySection,
  matrixRoles,
  statusLabels,
  type Access,
  type AccessStatus,
} from './permissions'
import styles from './PermissionsMatrix.module.css'

const sections = groupBySection()

/** Ancho del panel desde el que caben la capacidad y las tres columnas de rol. */
const TABLE_MIN_WIDTH = 720

const legend: AccessStatus[] = ['allowed', 'limited', 'none']

/**
 * La marca de cada estado. «Con límites» es el medio círculo de la maqueta y «Sin acceso» un guion: el kit no trae
 * icono para ellos y un candado diría «bloqueado», lo contrario de «solo los suyos». Los dos son decorativos: el
 * texto de al lado dice el estado.
 */
function StatusMark({ status }: { status: AccessStatus }) {
  if (status === 'allowed') return <Icon name="check" size={16} />
  return (
    <span aria-hidden="true" className={styles.glyph}>
      {status === 'limited' ? '◐' : '—'}
    </span>
  )
}

/** Lo que un rol puede hacer con una capacidad: icono y texto (nunca solo color), con «Con límites» para los parciales. */
function AccessValue({ access }: { access: Access }) {
  const status = accessStatus[access]
  return (
    <span className={cx(styles.value, styles[status])}>
      <StatusMark status={status} />
      {status === 'limited' && <span className="visually-hidden">{statusLabels.limited}: </span>}
      {accessLabels[access]}
    </span>
  )
}

function Legend() {
  return (
    <ul className={styles.legend} aria-label="Leyenda">
      {legend.map((status) => (
        <li key={status} className={cx(styles.legendItem, styles[status])}>
          <StatusMark status={status} />
          <span className={styles.legendText}>{statusLabels[status]}</span>
        </li>
      ))}
    </ul>
  )
}

function Table() {
  return (
    <table className={styles.table}>
      <caption className="visually-hidden">Capacidades de cada rol</caption>
      <thead className={styles.head}>
        <tr>
          <th scope="col">Capacidad</th>
          {matrixRoles.map((role) => (
            <th key={role} scope="col" className={styles.roleColumn}>
              {roleLabels[role]}
            </th>
          ))}
        </tr>
      </thead>
      {sections.map((section) => (
        <tbody key={section.name}>
          <tr>
            <th scope="rowgroup" colSpan={matrixRoles.length + 1} className={styles.section}>
              {section.name}
            </th>
          </tr>
          {section.capabilities.map((capability) => (
            <tr key={capability.key} className={styles.row}>
              <th scope="row" className={styles.capability}>
                <span className={styles.label}>{capability.label}</span>
                {capability.note && <span className={styles.note}>{capability.note}</span>}
              </th>
              {matrixRoles.map((role) => (
                <td key={role} className={styles.cell}>
                  <AccessValue access={capability.access[role]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  )
}

/** Un rol a la vez, con las capacidades agrupadas por sección: no cabe una tabla de cuatro columnas. */
function RoleView({ role, onRole, headingLevel }: { role: Role; onRole: (role: Role) => void; headingLevel: 2 | 3 }) {
  const Heading = `h${headingLevel}` as const
  const groupId = useId()
  return (
    <div className={styles.roleView}>
      <div role="group" aria-label="Rol" className={styles.selector}>
        {matrixRoles.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === role}
            className={styles.selectorButton}
            onClick={() => onRole(candidate)}
          >
            {roleLabels[candidate]}
          </button>
        ))}
      </div>
      {sections.map((section) => (
        <section key={section.name} className={styles.group} aria-labelledby={`${groupId}-${section.name}`}>
          <Heading id={`${groupId}-${section.name}`} className={styles.groupTitle}>
            {section.name}
          </Heading>
          <ul className={styles.items}>
            {section.capabilities.map((capability) => (
              <li key={capability.key} className={styles.item}>
                <span className={styles.itemText}>
                  <span className={styles.label}>{capability.label}</span>
                  {capability.note && <span className={styles.note}>{capability.note}</span>}
                </span>
                <AccessValue access={capability.access[role]} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * Matriz informativa de lo que puede hacer cada rol, generada de `permissions.ts`. Con ancho para ello (el del propio
 * panel, no el de la ventana) es una tabla con una columna por rol; sin él, un selector de rol muestra los permisos de
 * uno a la vez, agrupados por sección: ninguna acción se oculta por el ancho. No se guarda nada: los roles son fijos.
 */
export function PermissionsMatrix() {
  const me = useMe()
  const isPage = useMediaQuery('(min-width: 768px)')
  const [measure, width] = useElementWidth<HTMLDivElement>()
  const [chosen, setChosen] = useState<Role | null>(null)
  // Por defecto, el rol de quien mira: es lo que más le interesa saber.
  const role = chosen ?? (me.data?.role === 'admin' || me.data?.role === 'agent' ? me.data.role : 'admin')
  const wide = width !== null && width >= TABLE_MIN_WIDTH

  return (
    <section className={styles.root} aria-labelledby="permissions-heading">
      <header className={styles.intro}>
        <div className={styles.titles}>
          {isPage ? (
            <h2 id="permissions-heading" className={styles.heading}>
              Permisos por rol
            </h2>
          ) : (
            <span id="permissions-heading" className="visually-hidden">
              Permisos por rol
            </span>
          )}
          <p className={styles.description}>
            {isPage
              ? 'Qué puede hacer cada rol en tu espacio. Los roles son fijos.'
              : 'Qué puede hacer cada rol. Los roles son fijos.'}
          </p>
        </div>
        <Legend />
      </header>
      <div ref={measure} className={cx(styles.body, wide && styles.panel)}>
        {wide ? <Table /> : <RoleView role={role} onRole={setChosen} headingLevel={isPage ? 3 : 2} />}
      </div>
    </section>
  )
}
