import { useLocation, useNavigate } from 'react-router'
import { CustomerFormDialog } from './CustomerFormDialog'

/**
 * Ruta `/clientes/nuevo`: abre el alta sobre la lista, que sigue montada. Al cerrar se vuelve a la lista con sus filtros
 * (la búsqueda de la URL se conserva) y al crear se abre el cliente nuevo.
 */
export function NewCustomerDialog() {
  const navigate = useNavigate()
  const { search } = useLocation()
  return (
    <CustomerFormDialog
      mode="create"
      open
      onClose={() => void navigate({ pathname: '/clientes', search }, { replace: true })}
      onSaved={(customer) => void navigate(`/clientes/${customer.id}`, { replace: true })}
    />
  )
}
