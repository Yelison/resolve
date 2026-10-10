import { createThemeStore } from '@yelison/forma-ui'

export type { ResolvedTheme, ThemePreference } from '@yelison/forma-ui'

/** Debe coincidir con el script inline de index.html (`themeScript` con esta misma clave), que aplica el tema antes de que cargue React. */
export const THEME_STORAGE_KEY = 'resolve-theme'

/**
 * El almacén del tema de la aplicación: uno solo, compartido por todos los consumidores de `useTheme`. Guarda la
 * preferencia en `localStorage` bajo la clave de siempre (las preferencias de los usuarios se conservan), con un
 * respaldo en memoria si el almacenamiento no está disponible. Crearlo no toca la página.
 */
export const themeStore = createThemeStore({ storageKey: THEME_STORAGE_KEY })
