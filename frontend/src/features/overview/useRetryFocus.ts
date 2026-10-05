import { useCallback, useEffect, useRef } from 'react'

/**
 * Tras un reintento con éxito el botón «Reintentar» desaparece y el foco caería a `body`. El hook lo lleva al bloque
 * recuperado (`ref`, con `tabIndex={-1}` y nombre accesible, o un control del propio bloque). `loaded` pasa a `true`
 * cuando la consulta tiene éxito; solo se mueve el foco si hubo un reintento y la persona no lo ha llevado a otro
 * sitio mientras tanto (en ese caso el foco sigue en `body`).
 */
export function useRetryFocus<T extends HTMLElement>(loaded: boolean) {
  const ref = useRef<T>(null)
  const pending = useRef(false)

  useEffect(() => {
    if (!loaded || !pending.current) return
    pending.current = false
    const active = document.activeElement
    if (active === null || active === document.body) ref.current?.focus()
  }, [loaded])

  /** `refetch` de la consulta: un reintento fallido no deja la petición de foco pendiente. */
  const retry = useCallback((refetch: () => Promise<{ isError: boolean }>) => {
    pending.current = true
    void refetch().then((result) => {
      if (result.isError) pending.current = false
    })
  }, [])

  return { ref, retry }
}
