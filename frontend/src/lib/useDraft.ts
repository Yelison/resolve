import { useEffect, useState } from 'react'

/** Borrador por clave que sobrevive a recargas de la pestaña (sessionStorage). Sin almacenamiento, vive en memoria. */
export function useDraft(key: string) {
  const [draft, setDraft] = useState(() => {
    try {
      return sessionStorage.getItem(key) ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    try {
      if (draft) sessionStorage.setItem(key, draft)
      else sessionStorage.removeItem(key)
    } catch {
      // Almacenamiento bloqueado: el borrador sigue en memoria.
    }
  }, [key, draft])

  return [draft, setDraft] as const
}

/** Borra un borrador desde fuera del hook, p. ej. antes de navegar fuera de la pantalla que lo mantenía. */
export function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Almacenamiento bloqueado: no hay nada que borrar.
  }
}
