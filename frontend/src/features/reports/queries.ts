import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'
import type { ParameterReportPeriod as ReportPeriod } from '../../api/schema'

export const reportKeys = {
  all: ['reports'] as const,
  summary: (period: ReportPeriod) => [...reportKeys.all, 'summary', period] as const,
}

/** Informe del periodo, calculado en el servidor con la zona horaria de la organización. */
export function useReportSummary(period: ReportPeriod) {
  return useQuery({
    queryKey: reportKeys.summary(period),
    queryFn: ({ signal }) => unwrap(api.GET('/reports/summary', { params: { query: { period } }, signal })),
  })
}
