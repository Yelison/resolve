import { useSyncExternalStore } from 'react'

/**
 * ¿Está la demostración pública reiniciando sus datos? Lo marca cualquier petición que reciba ese `503`
 * (`lib/queryClient.ts`) y lo limpia la primera que salga bien: es un estado de toda la aplicación, no de una pantalla.
 */
let maintenance = false
const listeners = new Set<() => void>()

export const isDemoMaintenanceActive = () => maintenance

export function setDemoMaintenance(active: boolean) {
  if (maintenance === active) return
  maintenance = active
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useDemoMaintenance = () =>
  useSyncExternalStore(
    subscribe,
    () => maintenance,
    () => false,
  )
