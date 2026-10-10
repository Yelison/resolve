import { useTheme as useThemeStore } from '@yelison/forma-ui'
import { themeStore } from './theme'

/** Preferencia de tema del usuario y tema efectivo, sincronizados con el documento, el sistema y los demás consumidores. */
export function useTheme() {
  return useThemeStore(themeStore)
}
