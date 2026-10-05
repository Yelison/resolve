import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { DEMO_USER_STORAGE_KEY, setDemoUser } from '../../api/client'
import { Button, Select } from '../../components/ui'
import { demoUsers } from './demoUsers'
import styles from './session.module.css'
import { postSessionMessage } from './sessionChannel'
import { clearSessionData, focusContentWhenReady } from './sessionLifecycle'

function storedDemoUser() {
  try {
    return localStorage.getItem(DEMO_USER_STORAGE_KEY)
  } catch {
    return null
  }
}

export interface DemoUserPickerProps {
  /** Se llama cuando el cambio de usuario terminó. */
  onSwitched?: () => void
  /** Texto del botón; por defecto «Usar este usuario». */
  submitLabel?: string
}

/**
 * Selector del usuario de demostración. Solo se monta donde `isDemoLoginEnabled()` lo permite; los datos y la acción
 * son de demostración y no representan una autenticación real.
 */
export function DemoUserPicker({ onSwitched, submitLabel = 'Usar este usuario' }: DemoUserPickerProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [email, setEmail] = useState(() => {
    const stored = storedDemoUser()
    return demoUsers.some((user) => user.email === stored) ? (stored as string) : (demoUsers[0]?.email ?? '')
  })
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    try {
      // Los datos del usuario anterior se descartan antes de cambiar la cabecera, y se vuelve al resumen.
      await clearSessionData(queryClient)
      setDemoUser(email)
      postSessionMessage('signed-in')
      void navigate('/', { replace: true })
      onSwitched?.()
      // El selector (en /entrar) o el botón de la cuenta al que `Modal` devolvería el foco desaparecen con el cambio de
      // usuario: el foco va al contenido de la shell cuando el diálogo ya no está.
      focusContentWhenReady()
    } finally {
      setPending(false)
    }
  }

  return (
    <form className={styles.demoForm} onSubmit={(event) => void submit(event)} aria-busy={pending}>
      <Select
        label="Usuario de demostración"
        hint="Solo desarrollo: no es un inicio de sesión real."
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      >
        {demoUsers.map((user) => (
          <option key={user.email} value={user.email}>
            {user.label}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" loading={pending} loadingLabel="Cambiando…">
        {submitLabel}
      </Button>
    </form>
  )
}
