import { useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Me } from '../../api/schema'
import { normalizeText } from '../../lib/normalizeText'
import { Icon, Menu, SearchField, Tooltip, type MenuItem } from '../../components/ui'
import type { SidebarWorkspace } from '../../components/ui/Sidebar/Sidebar'
import { WorkspaceMark } from '../../components/ui/Sidebar/WorkspaceMark'
import { useSessionActions } from './useSessionActions'
import { workspaceRoleLabel, workspacesOf, type Workspace } from './workspaces'
import styles from './WorkspaceMenu.module.css'

/** Desde cuántos espacios el selector ofrece «Buscar espacio». */
export const SEARCH_FROM = 8

const SPACES_PATH = '/configuracion/espacios'

/** Un cliente solo cambia de espacio: «Tus espacios» y salir son del personal. */
const offersSpacesPage = (me: Me) => me.role !== 'customer'

/** Texto accesible de la tarjeta: el nombre completo aunque la pantalla lo corte con «…». */
const cardLabel = (name: string) => `Espacio: ${name}. Cambiar de espacio`

/**
 * Selector de espacios, en la tarjeta del `Sidebar` (expandido o colapsado): una fila por espacio con su rol y una marca
 * en el actual, y, para el personal, «Tus espacios». Elegir otro lo cambia como siempre (vacía la caché y vuelve a
 * Inicio). Desde 8 espacios lleva un buscador. El drawer móvil usa {@link WorkspaceDisclosure}, que se despliega dentro
 * del menú.
 */
export function WorkspaceMenu({ me, card }: { me: Me; card: SidebarWorkspace }) {
  const { switchOrganization } = useSessionActions()
  const navigate = useNavigate()
  const workspaces = workspacesOf(me)

  const items: MenuItem[] = workspaces.map((workspace) => ({
    id: workspace.id,
    label: workspace.name,
    title: workspace.name,
    description: workspaceRoleLabel(workspace),
    leading: <WorkspaceMark name={workspace.name} color={workspace.color} size="small" />,
    checked: workspace.current,
    searchable: true,
    // Mientras se cambia, las demás filas no se pueden elegir: una segunda petición cruzaría la primera.
    disabled: switchOrganization.isPending && !workspace.current,
    onSelect: () => {
      if (!workspace.current) switchOrganization.mutate({ organizationId: workspace.id })
    },
  }))
  if (offersSpacesPage(me)) {
    items.push({
      id: 'spaces',
      label: 'Tus espacios',
      icon: 'settings',
      separatorBefore: true,
      onSelect: () => void navigate(SPACES_PATH),
    })
  }

  return (
    <Menu
      label="Cambiar de espacio"
      items={items}
      placement="bottom-start"
      wide
      search={
        workspaces.length >= SEARCH_FROM
          ? { label: 'Buscar espacio', emptyText: 'Ningún espacio coincide con tu búsqueda.' }
          : undefined
      }
    >
      {(menu) => (
        // Colapsado solo se ve el cuadro: el nombre va en un tooltip, que se aparta mientras el menú está abierto.
        <Tooltip content={me.organization.name} describe={false} disabled={!card.collapsed || menu['aria-expanded']}>
          {(tooltip) => (
            <button
              type="button"
              className={card.className}
              aria-label={cardLabel(me.organization.name)}
              title={card.collapsed ? undefined : me.organization.name}
              {...menu}
              {...tooltip}
              ref={(node) => {
                menu.ref(node)
                tooltip.ref(node)
              }}
            >
              {card.content}
            </button>
          )}
        </Tooltip>
      )}
    </Menu>
  )
}

/**
 * El selector dentro del drawer móvil: la tarjeta del espacio despliega la lista debajo, en el propio menú, sin una
 * capa flotante encima de otra capa modal. Elegir un espacio lo cambia (la navegación cierra el drawer); «Tus espacios»
 * es un enlace.
 */
export function WorkspaceDisclosure({ me, card }: { me: Me; card: SidebarWorkspace }) {
  const { switchOrganization } = useSessionActions()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const panelId = useId()
  const cardRef = useRef<HTMLButtonElement>(null)
  const workspaces = workspacesOf(me)
  const searching = workspaces.length >= SEARCH_FROM
  const needle = normalizeText(query.trim())
  const shown = searching && needle ? workspaces.filter((w) => normalizeText(w.name).includes(needle)) : workspaces

  function choose(workspace: Workspace) {
    if (workspace.current) {
      // La fila que tenía el foco se desmonta: el foco vuelve a la tarjeta que abrió la lista, nunca a `body`.
      setOpen(false)
      cardRef.current?.focus()
    } else switchOrganization.mutate({ organizationId: workspace.id })
  }

  return (
    <div className={styles.disclosure}>
      <button
        ref={cardRef}
        type="button"
        className={card.className}
        aria-label={cardLabel(me.organization.name)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {card.content}
      </button>
      {open && (
        <div id={panelId} role="group" aria-label="Cambiar de espacio" className={styles.panel}>
          {searching && (
            <SearchField
              label="Buscar espacio"
              placeholder="Buscar espacio"
              value={query}
              onValueChange={setQuery}
              fieldClassName={styles.search}
            />
          )}
          <ul className={styles.list}>
            {shown.map((workspace) => (
              <li key={workspace.id}>
                <button
                  type="button"
                  className={styles.row}
                  aria-current={workspace.current || undefined}
                  aria-label={`${workspace.name}, ${workspaceRoleLabel(workspace)}`}
                  title={workspace.name}
                  disabled={switchOrganization.isPending && !workspace.current}
                  onClick={() => choose(workspace)}
                >
                  <WorkspaceMark name={workspace.name} color={workspace.color} size="small" />
                  <span className={styles.text}>
                    <span className={styles.name}>{workspace.name}</span>
                    <span className={styles.role}>{workspaceRoleLabel(workspace)}</span>
                  </span>
                  {workspace.current && <Icon name="check" className={styles.mark} />}
                </button>
              </li>
            ))}
          </ul>
          {searching && shown.length === 0 && (
            <p role="status" className={styles.empty}>
              Ningún espacio coincide con tu búsqueda.
            </p>
          )}
          {offersSpacesPage(me) && (
            <Link to={SPACES_PATH} className={styles.row}>
              <Icon name="settings" />
              Tus espacios
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
