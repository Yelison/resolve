import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { Me, TeamMember } from '../../api/schema'
import { Alert, Button, Modal } from '../../components/ui'
import { leaveFailure, useSessionActions, type LeaveFailure } from '../session/useSessionActions'
import { ONLY_WORKSPACE_TEXT, type Workspace } from '../session/workspaces'
import { memberKeys } from '../team/queries'
import styles from './LeaveWorkspaceDialog.module.css'

/**
 * Cuántos tickets quedarán sin asignar: los del equipo ya cargado del espacio actual (`openTickets` es lo que el servidor
 * libera, los no resueltos asignados a la persona). Sin esos datos a mano no se pide nada más y la frase va sin número.
 */
function releasedTickets(queryClient: ReturnType<typeof useQueryClient>, me: Me, workspace: Workspace): number | null {
  if (!workspace.current) return null
  const team = queryClient.getQueryData<TeamMember[]>(memberKeys.list())
  return team?.find((member) => member.id === me.user.id)?.openTickets ?? null
}

const releaseSentence = (count: number | null) =>
  count === null
    ? 'Los tickets que tengas asignados quedarán sin asignar.'
    : count === 0
      ? 'No tienes tickets asignados en este espacio.'
      : count === 1
        ? 'Tu ticket asignado quedará sin asignar.'
        : `Tus ${count} tickets asignados quedarán sin asignar.`

const failureText: Record<Exclude<LeaveFailure, 'last-admin'>, string> = {
  'last-organization': ONLY_WORKSPACE_TEXT,
  customer: 'Tu acceso a este espacio lo gestiona la empresa que te da soporte.',
  gone: 'Ya no formas parte de este espacio. La lista se ha actualizado.',
  other: 'Revisa tu conexión e inténtalo de nuevo.',
}

export interface LeaveWorkspaceDialogProps {
  me: Me
  /** Espacio que se deja; `null` cierra el diálogo. */
  workspace: Workspace | null
  onClose: () => void
  /** Se llama cuando el servidor confirmó la salida y el espacio no era el actual (si lo era, la aplicación se recarga sola). */
  onLeft: () => void
}

/**
 * «¿Salir de {nombre}?»: dice qué pasa con tus tickets y que para volver te tendrán que invitar. Nada se da por hecho
 * hasta la respuesta del servidor. Si eres el único administrador el servidor responde con el `type` `last-admin` y el
 * diálogo pasa a «No puedes salir de {nombre}», con «Ir a Equipo». Por debajo de 768 px es una hoja inferior.
 */
export function LeaveWorkspaceDialog({ me, workspace, onClose, onLeft }: LeaveWorkspaceDialogProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { leaveOrganization, switchOrganization } = useSessionActions()
  const { reset } = leaveOrganization
  const id = workspace?.id

  // Cada vez que se abre para un espacio parte sin el error del intento anterior.
  useEffect(() => {
    if (id) reset()
  }, [id, reset])

  const failure = leaveOrganization.isError ? leaveFailure(leaveOrganization.error) : null
  const lastAdmin = failure === 'last-admin'

  function leave(target: Workspace) {
    if (leaveOrganization.isPending) return
    leaveOrganization.mutate(
      { organizationId: target.id, name: target.name, current: target.current },
      { onSuccess: onLeft },
    )
  }

  function goToTeam(target: Workspace) {
    onClose()
    // En otro espacio, primero se cambia a él: Equipo es siempre el del espacio actual.
    if (target.current) void navigate('/equipo')
    else switchOrganization.mutate({ organizationId: target.id, to: '/equipo' })
  }

  return (
    <Modal
      open={workspace !== null}
      onClose={onClose}
      presentation="sheet-on-narrow"
      title={workspace ? (lastAdmin ? `No puedes salir de ${workspace.name}` : `¿Salir de ${workspace.name}?`) : ''}
      description={
        workspace
          ? lastAdmin
            ? 'Un espacio siempre necesita al menos un administrador.'
            : 'Dejarás de ver sus tickets, clientes y artículos.'
          : undefined
      }
      footer={
        workspace &&
        (lastAdmin ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button onClick={() => goToTeam(workspace)}>Ir a Equipo</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={leaveOrganization.isPending}
              loadingLabel="Saliendo…"
              disabled={failure === 'last-organization' || failure === 'customer' || failure === 'gone'}
              onClick={() => leave(workspace)}
            >
              Salir del espacio
            </Button>
          </>
        ))
      }
    >
      {workspace &&
        (lastAdmin ? (
          <Alert tone="amber" live title="Eres el único administrador">
            Da el rol de administrador a otra persona del equipo y después podrás salir.
          </Alert>
        ) : (
          <div className={styles.body}>
            <ul className={styles.list}>
              <li>Tus respuestas y notas se quedan en el historial con tu nombre.</li>
              <li>{releaseSentence(releasedTickets(queryClient, me, workspace))}</li>
              <li>Para volver, un administrador tendrá que invitarte.</li>
            </ul>
            {failure && (
              <Alert tone="red" live title="No pudimos sacarte del espacio">
                {failureText[failure]}
              </Alert>
            )}
          </div>
        ))}
    </Modal>
  )
}
