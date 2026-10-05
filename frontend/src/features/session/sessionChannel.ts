/** Canal entre pestañas de la misma aplicación y navegador. */
const CHANNEL_NAME = 'resolve-session'

/** Qué pasó en la pestaña que publica. */
export type SessionMessageType = 'logout' | 'organization-changed' | 'signed-in'

interface SessionMessage {
  type: SessionMessageType
  /** Pestaña que lo publicó: `BroadcastChannel` también entrega a otras instancias de la misma pestaña. */
  tab: string
}

/** Identifica esta carga de la aplicación; cada pestaña (y cada recarga) tiene el suyo. */
export const SESSION_TAB_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())

const types: SessionMessageType[] = ['logout', 'organization-changed', 'signed-in']
const isMessage = (data: unknown): data is SessionMessage =>
  typeof data === 'object' &&
  data !== null &&
  types.includes((data as SessionMessage).type) &&
  typeof (data as SessionMessage).tab === 'string'

/**
 * Avisa a las demás pestañas. La sesión HTTP y la organización activa viven en el servidor y son comunes a todas:
 * cuando una cambia, las otras deben enterarse sin esperar a un 401. Sin `BroadcastChannel` no hace nada (las demás se
 * enteran al recuperar el foco).
 */
export function postSessionMessage(type: SessionMessageType) {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    // El mensaje se encola al publicar: basta con abrir, publicar y cerrar, sin dejar un canal vivo a nivel de módulo.
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage({ type, tab: SESSION_TAB_ID } satisfies SessionMessage)
    channel.close()
  } catch {
    // Sin canal, las demás pestañas se enteran por el respaldo del foco.
  }
}

/** Escucha lo que publican las demás pestañas (nunca lo propio). Devuelve la función que deja de escuchar. */
export function subscribeSessionMessages(onMessage: (type: SessionMessageType) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event: MessageEvent) => {
    if (isMessage(event.data) && event.data.tab !== SESSION_TAB_ID) onMessage(event.data.type)
  }
  return () => channel.close()
}
