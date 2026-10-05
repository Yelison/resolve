import type { ParameterReportPeriod as ReportPeriod } from '../../api/schema'

/** Periodos que admite el informe, en el orden del selector. */
export const reportPeriods: readonly ReportPeriod[] = ['7d', '30d', '90d']

/** El mismo que el servidor aplica cuando no se envía `period`. */
export const DEFAULT_PERIOD: ReportPeriod = '7d'

export const periodLabels: Record<ReportPeriod, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
}

const PARAM = 'period'

/** Periodo de la URL; un valor ausente o desconocido vuelve al de por defecto. */
export function readPeriod(params: URLSearchParams): ReportPeriod {
  return reportPeriods.find((period) => period === params.get(PARAM)) ?? DEFAULT_PERIOD
}

/** `true` si la URL trae un `period` que no es ninguno de los admitidos (y por tanto hay que limpiarlo). */
export function hasInvalidPeriod(params: URLSearchParams): boolean {
  return params.has(PARAM) && !reportPeriods.some((period) => period === params.get(PARAM))
}

/** Escribe el periodo conservando el resto de parámetros; el de por defecto no se escribe, para URLs cortas. */
export function writePeriod(params: URLSearchParams, period: ReportPeriod): URLSearchParams {
  const next = new URLSearchParams(params)
  if (period === DEFAULT_PERIOD) next.delete(PARAM)
  else next.set(PARAM, period)
  return next
}
