import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Alert, Button, Modal } from '../../components/ui'
import { useMe } from './queries'
import { CreateWorkspaceForm } from './CreateWorkspaceForm'
import { limitSentence } from './workspaces'

export interface CreateWorkspaceDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * «Crear espacio»: pide el nombre y la zona horaria (la del navegador por defecto), con los errores bajo su campo, también
 * los `400` del servidor. Si la persona ya creó el máximo —el servidor responde `409` `organization-limit`, o `Me` dice
 * que ya no puede crear con el diálogo abierto— pasa a su propio estado con «Ver tus espacios». Al crear, la sesión
 * entra en el espacio nuevo (`useSessionActions`) y el diálogo se cierra. Por debajo de 768 px es una hoja inferior.
 * El diálogo solo existe mientras está abierto: cada vez parte de cero.
 */
export function CreateWorkspaceDialog({ open, onClose }: CreateWorkspaceDialogProps) {
  return open ? <Dialog onClose={onClose} /> : null
}

function Dialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const creation = useMe().data?.organizationCreation
  // El `409` ya se vio aunque `Me` aún no lo sepa; con `Me` al día, `allowed` lo dice solo.
  const [hitLimit, setHitLimit] = useState(false)
  const atLimit = hitLimit || (creation !== undefined && !creation.allowed && creation.created >= creation.limit)
  const notAllowed = !atLimit && creation !== undefined && !creation.allowed

  if (atLimit || notAllowed) {
    return (
      <Modal
        open
        onClose={onClose}
        presentation="sheet-on-narrow"
        title="Crear espacio"
        description={atLimit ? limitSentence(creation?.limit) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            {atLimit && (
              <Button
                onClick={() => {
                  onClose()
                  void navigate('/configuracion/espacios')
                }}
              >
                Ver tus espacios
              </Button>
            )}
          </>
        }
      >
        <Alert
          tone="blue"
          live
          title={
            atLimit
              ? 'Para crear otro, sal de uno que ya no uses o pide a otra persona que lo cree.'
              : 'Solo quien administra un espacio puede crear otros.'
          }
        />
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      presentation="sheet-on-narrow"
      title="Crear espacio"
      description="Tendrás tu propio equipo, clientes y base de conocimiento. Serás su administrador."
    >
      <CreateWorkspaceForm onCreated={onClose} onCancel={onClose} onLimit={() => setHitLimit(true)} />
    </Modal>
  )
}
