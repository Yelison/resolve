import { useState, type Ref } from 'react'
import { Alert, Button } from '../../components/ui'
import { CreateWorkspaceForm } from './CreateWorkspaceForm'
import type { Newcomer } from './newcomer'
import styles from './session.module.css'
import { focusContentWhenReady } from './sessionLifecycle'
import { limitSentence } from './workspaces'

interface CardProps {
  newcomer: Newcomer
  /** El título: recibe el foco al aparecer la pantalla (lo gestiona `LoginPage`). */
  heading: Ref<HTMLHeadingElement>
  /** «Entrar con otra cuenta»; sin él (sin cookie de CSRF, no se puede cerrar la sesión) no se ofrece. */
  onSignOut?: () => void
  signingOut: boolean
}

function SignOutButton({ onSignOut, signingOut }: Pick<CardProps, 'onSignOut' | 'signingOut'>) {
  if (!onSignOut) return null
  return (
    <Button variant="secondary" block loading={signingOut} loadingLabel="Cerrando sesión…" onClick={onSignOut}>
      Entrar con otra cuenta
    </Button>
  )
}

/**
 * «Crea tu espacio»: la instalación está abierta (`canCreateOrganization`) y quien entra no tiene espacio. Es el mismo
 * formulario que el diálogo «Crear espacio» (`CreateWorkspaceForm`), sin «Cancelar»: no hay a dónde volver. Al crear, la
 * sesión entra en el espacio nuevo (Inicio, con «Primeros pasos» y el aviso) y el foco va a su contenido, porque el
 * formulario desaparece con la pantalla. El `400` queda bajo su campo; el `409` del límite no debería darse aquí (aún no
 * hay espacios que cuenten), pero se avisa; si la instalación se cierra entretanto, `LoginPage` pasa a `NoWorkspaceCard`.
 */
export function CreateYourWorkspaceCard({ newcomer, heading, onSignOut, signingOut }: CardProps) {
  const [limitReached, setLimitReached] = useState(false)
  return (
    <div className={styles.entry}>
      <div className={styles.intro}>
        <h1 ref={heading} tabIndex={-1} className={styles.title}>
          Crea tu espacio
        </h1>
        <p className={styles.lead}>
          Hola, {newcomer.name}. Aún no estás en ningún espacio. Crea el de tu equipo para empezar a atender a tus
          clientes.
        </p>
      </div>
      {limitReached && (
        <Alert tone="blue" live title={limitSentence(undefined)}>
          Entra con otra cuenta o pide a alguien de tu equipo que te invite.
        </Alert>
      )}
      <CreateWorkspaceForm onCreated={focusContentWhenReady} onLimit={() => setLimitReached(true)} />
      <div className={styles.account}>
        <p>
          ¿Te invitaron a un espacio? Entra con el correo de la invitación. Ahora estás como{' '}
          <span className={styles.email}>{newcomer.email}</span>.
        </p>
        <SignOutButton onSignOut={onSignOut} signingOut={signingOut} />
      </div>
    </div>
  )
}

/**
 * «Aún no estás en ningún espacio»: la instalación no deja crear (`canCreateOrganization: false`), así que la persona
 * necesita una invitación al correo con el que entró, que aquí se ve como texto que se puede seleccionar y copiar.
 */
export function NoWorkspaceCard({ newcomer, heading, onSignOut, signingOut }: CardProps) {
  return (
    <div className={styles.entry}>
      <div className={styles.intro}>
        <h1 ref={heading} tabIndex={-1} className={styles.title}>
          Aún no estás en ningún espacio
        </h1>
        <p className={styles.lead}>Pide a alguien de tu equipo que te invite con este correo:</p>
      </div>
      <p className={styles.emailBox}>{newcomer.email}</p>
      <SignOutButton onSignOut={onSignOut} signingOut={signingOut} />
    </div>
  )
}

/** La pantalla que corresponde a quien llegó sin espacio, según pueda o no crear el suyo. */
export function NewcomerCard(props: CardProps) {
  return props.newcomer.canCreate ? <CreateYourWorkspaceCard {...props} /> : <NoWorkspaceCard {...props} />
}
