import { Button, Modal } from '../../components/ui'
import { DemoUserPicker } from './DemoUserPicker'

/** Diálogo para cambiar de usuario de demostración desde el menú de la cuenta (solo desarrollo y build `smoke`). */
export function DemoUserSwitcher({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Cambiar de usuario de demostración"
      description="Los datos del usuario actual se descartan y la aplicación vuelve al resumen."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <DemoUserPicker submitLabel="Cambiar de usuario" onSwitched={onClose} />
    </Modal>
  )
}
