import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  applyPreference,
  readPreference,
  savePreference,
  subscribeToSystemTheme,
  systemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme'

/*
 * La preferencia es un estado compartido por todos los consumidores del hook (el shell y «Apariencia»): el
 * almacenamiento es la fuente de verdad y `setPreference` avisa a quienes la leen. `override` solo existe cuando el
 * almacenamiento no está disponible (modo privado o bloqueado): la elección dura entonces lo que dure la sesión.
 */
const listeners = new Set<() => void>()
let override: ThemePreference | null = null

const currentPreference = (): ThemePreference => override ?? readPreference()

function subscribeToPreference(callback: () => void): () => void {
  listeners.add(callback)
  // Otra pestaña cambió la preferencia guardada.
  window.addEventListener('storage', callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener('storage', callback)
  }
}

function storePreference(next: ThemePreference): void {
  savePreference(next)
  override = readPreference() === next ? null : next
  listeners.forEach((listener) => listener())
}

/** Preferencia de tema del usuario y tema efectivo, sincronizados con el documento, el sistema y los demás consumidores. */
export function useTheme() {
  const preference = useSyncExternalStore(subscribeToPreference, currentPreference, () => 'system' as const)
  const system = useSyncExternalStore(subscribeToSystemTheme, systemTheme, () => 'light' as const)
  const resolved: ResolvedTheme = preference === 'system' ? system : preference

  useEffect(() => {
    applyPreference(preference)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    storePreference(next)
  }, [])

  /** Alterna entre claro y oscuro partiendo del tema que se ve ahora. */
  const toggle = useCallback(() => {
    setPreference(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setPreference])

  return { preference, resolved, setPreference, toggle }
}
