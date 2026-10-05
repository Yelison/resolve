import { useMe } from './queries'

/**
 * Zona horaria con la que se muestran las fechas: la de la organización, la misma con la que el servidor
 * calcula «hoy» en las métricas. Mientras `/me` carga (o si falla) se usa la del navegador.
 */
export function useTimeZone(): string {
  const me = useMe()
  return me.data?.organization.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
}
