import type { ComboboxOption } from '../../components/ui'
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
  { key: 'mon', label: 'Lunes', shortLabel: 'L', values: { requests: 44 } },
  { key: 'tue', label: 'Martes', shortLabel: 'M', values: { requests: 61 } },
  { key: 'wed', label: 'Miércoles', shortLabel: 'X', values: { requests: 54 } },
  { key: 'thu', label: 'Jueves', shortLabel: 'J', values: { requests: 72 } },
  { key: 'fri', label: 'Viernes', shortLabel: 'V', values: { requests: 65 } },
  { key: 'sat', label: 'Sábado', shortLabel: 'S', values: { requests: 35 } },
  { key: 'sun', label: 'Domingo', shortLabel: 'D', values: { requests: 30 } },
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
