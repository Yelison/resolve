import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  applyPreference,
  readPreference,
  savePreference,
  subscribeToSystemTheme,
  systemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme'

/** Preferencia de tema del usuario y tema efectivo, sincronizados con el documento y el sistema. */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const system = useSyncExternalStore(subscribeToSystemTheme, systemTheme, () => 'light' as const)
  const resolved: ResolvedTheme = preference === 'system' ? system : preference

  useEffect(() => {
    applyPreference(preference)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    savePreference(next)
    setPreferenceState(next)
  }, [])

  /** Alterna entre claro y oscuro partiendo del tema que se ve ahora. */
  const toggle = useCallback(() => {
    setPreference(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setPreference])

  return { preference, resolved, setPreference, toggle }
}
