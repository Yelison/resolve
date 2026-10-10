import type {
  ComboboxOption,
  DonutSegment,
  DotPlotRow,
  HeatmapColumn,
  HeatmapRow,
  LineChartPoint,
} from '../../components/ui'
import type { TicketSummary } from '../../domain/ticket'

/** Momento de referencia de los datos de demostración, fijado al cargar el módulo. */
export const demoNow = new Date()

const minutesAgo = (minutes: number) => new Date(demoNow.getTime() - minutes * 60_000).toISOString()

/** Datos ficticios para mostrar los componentes. No proceden de ninguna API. */
export const demoTickets: TicketSummary[] = [
  {
    id: 't-1048',
    number: 1048,
    subject: 'No puedo acceder a mi cuenta',
    customer: { id: 'c-1', name: 'María Pérez', email: 'maria@example.com', company: 'Acme Studio' },
    status: 'open',
    priority: 'urgent',
    channel: 'email',
    assignee: { id: 'u-1', name: 'Laura Méndez' },
    createdAt: minutesAgo(18),
    updatedAt: minutesAgo(5),
  },
  {
    id: 't-1047',
    number: 1047,
    subject: 'Error al procesar el pago con tarjeta corporativa en la renovación anual',
    customer: { id: 'c-2', name: 'Carlos Ruiz', email: 'carlos@example.com', company: 'Northstar' },
    status: 'in_progress',
    priority: 'high',
    channel: 'chat',
    assignee: { id: 'u-2', name: 'Daniel Santos' },
    createdAt: minutesAgo(60),
    updatedAt: minutesAgo(42),
  },
  {
    id: 't-1046',
    number: 1046,
    subject: 'Cambiar correo de facturación',
    customer: { id: 'c-3', name: 'Ana Gómez', email: 'ana@example.com', company: 'Orbit Labs' },
    status: 'waiting',
    priority: 'medium',
    channel: 'web',
    assignee: null,
    createdAt: minutesAgo(26 * 60 + 5),
    updatedAt: minutesAgo(26 * 60),
  },
]

/** Datos de demostración para `BarChart`. No son métricas reales. */
export const demoChartSeries = [{ id: 'requests', label: 'Solicitudes' }]

export const demoChartPoints = [
  { key: 'mon', label: 'Lunes', shortLabel: 'lun', values: { requests: 44 } },
  { key: 'tue', label: 'Martes', shortLabel: 'mar', values: { requests: 61 } },
  { key: 'wed', label: 'Miércoles', shortLabel: 'mié', values: { requests: 54 } },
  { key: 'thu', label: 'Jueves', shortLabel: 'jue', values: { requests: 72 } },
  { key: 'fri', label: 'Viernes', shortLabel: 'vie', values: { requests: 65 } },
  { key: 'sat', label: 'Sábado', shortLabel: 'sáb', values: { requests: 35 } },
  { key: 'sun', label: 'Domingo', shortLabel: 'dom', values: { requests: 30 } },
]

/** Serie diaria sintética (valores de cuatro cifras incluidos) para probar el gráfico con muchos puntos. */
export function demoDailyPoints(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1
    return {
      key: `d${day}`,
      label: `Día ${day}`,
      shortLabel: String(day),
      values: { requests: 900 + ((day * 37) % 410), resolved: 700 + ((day * 53) % 380) },
    }
  })
}

export const demoTwoSeries = [
  { id: 'requests', label: 'Creados' },
  { id: 'resolved', label: 'Resueltos', color: 'muted' as const },
]

/** Datos de demostración para `ProgressBar`. */
export const demoChannelShare = [
  { label: 'Correo', value: 62 },
  { label: 'Portal', value: 28 },
  { label: 'Chat', value: 10 },
]

/** Agentes ficticios para el `Combobox` del catálogo. */
export const demoAgents: ComboboxOption[] = [
  { value: 'u-1', label: 'Laura Méndez', description: 'Administradora' },
  { value: 'u-2', label: 'Daniel Santos', description: 'Agente' },
  { value: 'u-3', label: 'Ana Ruiz', description: 'Agente' },
]

/** Datos de demostración para `DonutChart`: el color sigue al canal, no a su posición. */
export const demoDonutChannels: DonutSegment[] = [
  { id: 'email', label: 'Correo', value: 56, color: 1, valueText: '45,5 % · 56 tickets' },
  { id: 'chat', label: 'Chat', value: 41, color: 2, valueText: '33,3 % · 41 tickets' },
  { id: 'web', label: 'Web', value: 17, color: 4, valueText: '13,8 % · 17 tickets' },
  { id: 'phone', label: 'Teléfono', value: 9, color: 3, valueText: '7,3 % · 9 tickets' },
]

export const demoDonutTiny: DonutSegment[] = [
  { id: 'email', label: 'Correo', value: 3900, color: 1, valueText: '99,9 % · 3.900 tickets' },
  { id: 'phone', label: 'Teléfono', value: 3, color: 3, valueText: '0,1 % · 3 tickets' },
]

export const demoDonutLongNames: DonutSegment[] = [
  {
    id: 'a',
    label: 'Soporte técnico de la región norte con un nombre larguísimo que no cabe en una línea',
    value: 70,
    color: 1,
    valueText: '70 % · 70 tickets',
  },
  {
    id: 'b',
    label: 'Facturación y cobros de clientes corporativos',
    value: 30,
    color: 2,
    valueText: '30 % · 30 tickets',
  },
]

/** Serie sintética de `n` días para `LineChart` y `Sparkline`; `shape` decide si crece, oscila o baja de 0. */
export function demoLinePoints(days: number, shape: 'growing' | 'negative' = 'growing'): LineChartPoint[] {
  let total = 0
  return Array.from({ length: days }, (_, index) => {
    total += shape === 'growing' ? ((index * 7) % 9) - 2 : ((index * 5) % 7) - 4
    return {
      key: `d${index}`,
      label: `Día ${index + 1}`,
      shortLabel: String(index + 1),
      value: Math.max(shape === 'growing' ? 0 : -50, total),
    }
  })
}

export const demoLongNamePoints: LineChartPoint[] = [
  {
    key: 'a',
    label: 'Semana del lunes 28 de septiembre al domingo 4 de octubre de 2026',
    shortLabel: '28 sept – 4 oct',
    value: 12,
  },
  {
    key: 'b',
    label: 'Semana del lunes 5 de octubre al domingo 11 de octubre de 2026',
    shortLabel: '5 – 11 oct',
    value: 30,
  },
  {
    key: 'c',
    label: 'Semana del lunes 12 de octubre al domingo 18 de octubre de 2026',
    shortLabel: '12 – 18 oct',
    value: 21,
  },
]

/** Datos de demostración para `DotPlot`: minutos hasta la primera respuesta frente a un objetivo de 30. */
export const demoDotRows: DotPlotRow[] = [
  { key: 'laura', label: 'Laura Méndez', value: 14 },
  { key: 'daniel', label: 'Daniel Santos', value: 28 },
  { key: 'ana', label: 'Ana Ruiz', value: 41 },
]

export const demoDotLongNames: DotPlotRow[] = [
  {
    key: 'a',
    label: 'Alejandra Fernández de la Fuente y Montenegro, responsable de la cuenta de clientes corporativos del norte',
    value: 21,
  },
  { key: 'b', label: 'Pablo Viejo', value: 64 },
]

/** Un orden de mayor a menor urgencia en un solo tono: los pasos claros del anillo llevan contorno. */
export const demoDonutPriority: DonutSegment[] = [
  { id: 'urgent', label: 'Urgente', value: 4, color: 'seq1', valueText: '4' },
  { id: 'high', label: 'Alta', value: 9, color: 'seq2', valueText: '9' },
  { id: 'medium', label: 'Media', value: 16, color: 'seq3', valueText: '16' },
  { id: 'low', label: 'Baja', value: 9, color: 'seq4', valueText: '9' },
]

export const demoHeatmapRows: HeatmapRow[] = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((label) => ({
  key: label,
  label,
}))
export const demoHeatmapColumns: HeatmapColumn[] = Array.from({ length: 12 }, (_, index) => ({
  key: String(index * 2),
  label: String(index * 2),
  name: `${index * 2}–${index * 2 + 2} h`,
}))

/** Horario de oficina entre semana y poco movimiento el fin de semana, con celdas vacías de madrugada. */
export const demoHeatmapOffice: number[][] = demoHeatmapRows.map((_, row) =>
  demoHeatmapColumns.map((_, column) => {
    const base = [0, 0, 0, 0, 14, 40, 36, 38, 30, 16, 6, 0][column] ?? 0
    return row >= 5 ? Math.round(base / 4) : base + ((row * 3 + column) % 5)
  }),
)

/** Todas las celdas con datos y valores muy distintos: de 1 a 1.320, para ver los cuatro pasos a la vez. */
export const demoHeatmapDense: number[][] = demoHeatmapRows.map((_, row) =>
  demoHeatmapColumns.map((_, column) => 1 + ((row * 12 + column) % 7) ** 4 + (column === 7 ? 800 : 0)),
)
