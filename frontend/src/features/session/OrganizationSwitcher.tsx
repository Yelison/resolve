import { useId, useState, type FormEvent } from 'react'
import type { Me } from '../../api/schema'
import { Alert, Button, Modal, Radio } from '../../components/ui'
import styles from './session.module.css'
import { organizationErrorText, useSessionActions } from './useSessionActions'

export interface OrganizationSwitcherProps {
  me: Me
  /** Se llama al cerrar el diálogo, con o sin cambio. */
  onClose: () => void
}

/**
 * Diálogo para elegir la organización activa. Cambiarla vacía la caché y vuelve al resumen, así que se confirma con un
 * botón en lugar de cambiar al pulsar una opción.
 */
export function OrganizationSwitcher({ me, onClose }: OrganizationSwitcherProps) {
  const formId = useId()
  const radioName = useId()
  const { switchOrganization } = useSessionActions()
  const [selected, setSelected] = useState(me.organization.id)
  const organizations = me.organizations ?? []

  function submit(event: FormEvent) {
    event.preventDefault()
    if (switchOrganization.isPending || selected === me.organization.id) return
    switchOrganization.mutate(selected, { onSuccess: onClose })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Cambiar de organización"
      description="Verás los datos de la organización que elijas. Lo que no hayas enviado se descarta."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={switchOrganization.isPending}
            loadingLabel="Cambiando…"
            disabled={selected === me.organization.id}
          >
            Cambiar de organización
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.organizationForm} onSubmit={submit} aria-busy={switchOrganization.isPending}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Organización</legend>
          {organizations.map((organization) => (
            <Radio
              key={organization.id}
              name={radioName}
              value={organization.id}
              checked={selected === organization.id}
              onChange={() => {
                setSelected(organization.id)
                if (switchOrganization.isError) switchOrganization.reset()
              }}
              label={
                <span className={styles.organizationName}>
                  {organization.name}
                  {organization.id === me.organization.id && (
                    <>
                      {' '}
                      <span className={styles.current}>(actual)</span>
                    </>
                  )}
                </span>
              }
            />
          ))}
        </fieldset>
        {switchOrganization.isError && (
          <Alert tone="red" live title="No pudimos cambiar de organización">
            {organizationErrorText(switchOrganization.error)}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
