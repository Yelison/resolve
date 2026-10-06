import { useCallback, useRef } from 'react'

/**
 * Recuerda el último envío para poder repetirlo tal cual tras un `503` de bloqueo. El envío es la llamada ya compuesta
 * (variables, `If-Match` incluido, y lo que se hace al terminar), no la función que la compone: así el reintento lleva
 * el mismo cuerpo y la misma versión aunque entre tanto la pantalla haya recibido datos nuevos. Si otra persona guardó
 * en medio, el servidor responde el 412 de siempre y nada se pisa.
 */
export function useRepeatableSubmission() {
  const last = useRef<(() => void) | null>(null)
  const send = useCallback((submission: () => void) => {
    last.current = submission
    submission()
  }, [])
  const retry = useCallback(() => last.current?.(), [])
  return { send, retry }
}
