import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Badge, Button, EmptyState, Icon, IconButton, Modal } from '../../components/ui'
import { WorkspaceMark } from '../../components/ui/Sidebar/WorkspaceMark'
import { focusPageHeading } from '../../lib/focusPageHeading'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { peopleCount } from '../team/teamCopy'
import { useMe } from '../session/queries'
import { useSessionActions } from '../session/useSessionActions'
import {
  canLeave,
  isOnlyWorkspace,
  ONLY_WORKSPACE_TEXT,
  workspaceRoleLabel,
  workspacesOf,
  type Workspace,
} from '../session/workspaces'
import { FormGhost } from './FormGhost'
import { LeaveWorkspaceDialog } from './LeaveWorkspaceDialog'
import styles from './WorkspacesSection.module.css'

/** Desde este ancho cada fila lleva sus botones; por debajo, toda la fila abre el espacio y «⋯» abre una hoja. */
const WIDE = '(min-width: 768px)'

/** «Administrador · 12 personas», o «Soporte de Norte Viajes» si eres cliente. Sin recuento no se inventa uno. */
function metaOf(workspace: Workspace) {
  if (workspace.role === 'customer') return `Soporte de ${workspace.name}`
  const role = workspaceRoleLabel(workspace)
  return workspace.memberCount ? `${role} · ${peopleCount(workspace.memberCount)}` : role
}

/**
 * Configuración › Tus espacios (Tu cuenta): los espacios donde la persona trabaja o recibe soporte, con su rol, y desde
 * donde abre uno o sale de él. Sale de `Me.organizations`, que el servidor entrega con cada sesión. Es del personal: el
 * cliente no la ve (`StaffOnly`) y, en la fila de un espacio donde es cliente, no hay «Salir».
 */
export function WorkspacesSection() {
  const me = useMe()
  if (me.data) return <WorkspacesPanel me={me.data} />
  if (me.isError) {
    return (
      <EmptyState
        kind="error"
        title="No pudimos cargar tus espacios"
        headingLevel={2}
        action={
          <Button variant="secondary" aria-label="Reintentar cargar tus espacios" onClick={() => void me.refetch()}>
            Reintentar
          </Button>
        }
      />
    )
  }
  return (
    <FormGhost label="Cargando tus espacios…">
      <WorkspaceRows workspaces={[ghostWorkspace]} wide onOpen={noop} onLeave={noop} onActions={noop} />
    </FormGhost>
  )
}

const noop = () => {}
const ghostWorkspace: Workspace = {
  id: 'ghost',
  name: ' ',
  role: 'agent',
  color: 'blue',
  memberCount: 1,
  current: true,
}

function WorkspacesPanel({ me }: { me: NonNullable<ReturnType<typeof useMe>['data']> }) {
  const wide = useMediaQuery(WIDE)
  const navigate = useNavigate()
  const { switchOrganization } = useSessionActions()
  const workspaces = workspacesOf(me)
  const [actions, setActions] = useState<Workspace | null>(null)
  const [leaving, setLeaving] = useState<Workspace | null>(null)
  const returnTo = useRef<string | null>(null)

  function open(workspace: Workspace) {
    if (workspace.current) void navigate('/')
    else switchOrganization.mutate({ organizationId: workspace.id })
  }

  // Al cerrar la hoja o el diálogo sin salir, el foco vuelve al botón que los abrió; si ese botón ya no existe (el
  // espacio desapareció de la lista) va al título de la página, nunca a `body`.
  const idle = actions === null && leaving === null
  useEffect(() => {
    if (!idle || returnTo.current === null) return
    const id = returnTo.current
    returnTo.current = null
    const timer = window.setTimeout(() => {
      const active = document.activeElement
      if (active && active !== document.body) return
      const trigger = document.querySelector<HTMLElement>(`[data-leave-trigger="${id}"]`)
      if (trigger) trigger.focus()
      else focusPageHeading()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [idle])

  const startLeaving = (workspace: Workspace) => {
    returnTo.current = workspace.id
    setActions(null)
    setLeaving(workspace)
  }
  const openActions = (workspace: Workspace) => {
    returnTo.current = workspace.id
    setActions(workspace)
  }

  return (
    <section className={styles.panel} aria-labelledby="workspaces-heading">
      <div className={styles.header}>
        {/* En móvil el título de la página ya dice «Tus espacios»: el de la lista queda para lectores de pantalla. */}
        <h2 id="workspaces-heading" className={wide ? styles.title : 'visually-hidden'}>
          Tus espacios
        </h2>
        <p className={styles.description}>
          {wide
            ? 'Los espacios donde trabajas o recibes soporte, con tu rol en cada uno.'
            : 'Toca un espacio para abrirlo.'}
        </p>
      </div>
      <WorkspaceRows
        workspaces={workspaces}
        wide={wide}
        onOpen={open}
        onLeave={startLeaving}
        onActions={openActions}
        opening={switchOrganization.isPending}
      />
      <WorkspaceActionsSheet
        workspace={actions}
        only={isOnlyWorkspace(workspaces)}
        onClose={() => setActions(null)}
        onOpen={(workspace) => {
          setActions(null)
          open(workspace)
        }}
        onLeave={startLeaving}
      />
      <LeaveWorkspaceDialog
        me={me}
        workspace={leaving}
        onClose={() => setLeaving(null)}
        onLeft={() => {
          // La fila sale de la lista: el foco cae en el título en lugar de en `body`.
          returnTo.current = null
          setLeaving(null)
          window.setTimeout(focusPageHeading, 0)
        }}
      />
    </section>
  )
}

interface RowsProps {
  workspaces: Workspace[]
  wide: boolean
  onOpen: (workspace: Workspace) => void
  onLeave: (workspace: Workspace) => void
  onActions: (workspace: Workspace) => void
  opening?: boolean
}

function WorkspaceRows({ workspaces, wide, onOpen, onLeave, onActions, opening = false }: RowsProps) {
  const only = isOnlyWorkspace(workspaces)
  return (
    <ul className={styles.list}>
      {workspaces.map((workspace) =>
        wide ? (
          <DesktopRow
            key={workspace.id}
            workspace={workspace}
            only={only}
            opening={opening}
            onOpen={onOpen}
            onLeave={onLeave}
          />
        ) : (
          <MobileRow key={workspace.id} workspace={workspace} onOpen={onOpen} onActions={onActions} opening={opening} />
        ),
      )}
    </ul>
  )
}

function Identity({ workspace, mobile = false }: { workspace: Workspace; mobile?: boolean }) {
  return (
    <>
      <WorkspaceMark name={workspace.name} color={workspace.color} size="large" />
      <span className={styles.identity}>
        <span className={styles.name}>{workspace.name}</span>
        <span className={styles.meta}>
          {metaOf(workspace)}
          {mobile && workspace.current && (
            <Badge tone="blue" className={styles.here}>
              Estás aquí
            </Badge>
          )}
        </span>
      </span>
    </>
  )
}

function DesktopRow({
  workspace,
  only,
  opening,
  onOpen,
  onLeave,
}: {
  workspace: Workspace
  only: boolean
  opening: boolean
  onOpen: (workspace: Workspace) => void
  onLeave: (workspace: Workspace) => void
}) {
  const hintId = useId()
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <Identity workspace={workspace} />
      </div>
      <div className={styles.actions}>
        {workspace.current ? (
          <Badge tone="blue">Estás aquí</Badge>
        ) : (
          <Button
            variant="secondary"
            aria-label={`Abrir ${workspace.name}`}
            disabled={opening}
            onClick={() => onOpen(workspace)}
          >
            Abrir
          </Button>
        )}
        {canLeave(workspace) && (
          <span className={styles.leaveGroup}>
            <Button
              variant="secondary"
              className={styles.leave}
              aria-label={`Salir de ${workspace.name}`}
              aria-describedby={only ? hintId : undefined}
              disabled={only}
              data-leave-trigger={workspace.id}
              onClick={() => onLeave(workspace)}
            >
              Salir
            </Button>
            {only && (
              <span id={hintId} className={styles.hint}>
                {ONLY_WORKSPACE_TEXT}
              </span>
            )}
          </span>
        )}
      </div>
    </li>
  )
}

function MobileRow({
  workspace,
  opening,
  onOpen,
  onActions,
}: {
  workspace: Workspace
  opening: boolean
  onOpen: (workspace: Workspace) => void
  onActions: (workspace: Workspace) => void
}) {
  return (
    <li className={styles.row}>
      <button type="button" className={styles.rowButton} disabled={opening} onClick={() => onOpen(workspace)}>
        <Identity workspace={workspace} mobile />
      </button>
      {canLeave(workspace) ? (
        <IconButton
          icon="more"
          label={`Más acciones para ${workspace.name}`}
          data-leave-trigger={workspace.id}
          onClick={() => onActions(workspace)}
        />
      ) : (
        <span className={styles.forward} aria-hidden="true">
          <Icon name="chevron" size={20} />
        </span>
      )}
    </li>
  )
}

/** La hoja de «⋯» en móvil: el espacio arriba, «Abrir», «Salir del espacio» y «Cancelar». */
function WorkspaceActionsSheet({
  workspace,
  only,
  onClose,
  onOpen,
  onLeave,
}: {
  workspace: Workspace | null
  only: boolean
  onClose: () => void
  onOpen: (workspace: Workspace) => void
  onLeave: (workspace: Workspace) => void
}) {
  const hintId = useId()
  return (
    <Modal
      open={workspace !== null}
      onClose={onClose}
      presentation="sheet-on-narrow"
      title={workspace?.name ?? ''}
      description={workspace ? metaOf(workspace) : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      {workspace && (
        <div className={styles.sheet}>
          {!workspace.current && (
            <button type="button" className={styles.sheetAction} onClick={() => onOpen(workspace)}>
              <Icon name="arrow" size={20} className={styles.sheetIcon} />
              {`Abrir ${workspace.name}`}
            </button>
          )}
          {canLeave(workspace) && (
            <>
              <button
                type="button"
                className={`${styles.sheetAction} ${styles.sheetDanger}`}
                disabled={only}
                aria-describedby={only ? hintId : undefined}
                onClick={() => onLeave(workspace)}
              >
                {/* Mismo hueco que el icono de «Abrir»: los dos textos empiezan en la misma columna. */}
                <span className={styles.sheetIconSlot} aria-hidden="true" />
                Salir del espacio
              </button>
              {only && (
                <p id={hintId} className={styles.hint}>
                  {ONLY_WORKSPACE_TEXT}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
