import type { TicketMetrics } from '../../domain/ticket'
import { newToday } from '../../lib/format'
import { compareResolved } from './overviewData'
import { overFourHours } from './overviewText'

/** Cómo se lee el detalle de un dato: el texto siempre dice lo mismo que el color. */
export type PulseTone = 'neutral' | 'good' | 'warning' | 'danger'

export interface PulseCell {
  id: 'open' | 'unassigned' | 'firstResponse' | 'resolved'
  label: string
  value: string
  /** Frase del detalle; con `arrow`, una flecha decorativa delante. */
  detail: string
  arrow?: '↑' | '↓'
  tone: PulseTone
  /**
   * El detalle más largo que puede llevar esta celda. Reserva su altura en cualquier ancho: así la franja mide lo mismo
   * cargando y con datos, diga lo que diga el detalle, y lo de debajo no salta.
   */
  reserve: string
  /** Vista filtrada de la bandeja (o del informe) donde se trabaja ese dato. */
  to: string
}

/** Lo que `pulseCells` lee de las métricas. */
export type PulseMetrics = Pick<
  TicketMetrics,
  | 'open'
  | 'openedToday'
  | 'resolvedToday'
  | 'resolvedYesterday'
  | 'unassignedOver4Hours'
  | 'firstResponseMinutes'
  | 'firstResponseTargetMinutes'
> & { views: Pick<TicketMetrics['views'], 'unassigned'> }

/**
 * Las cuatro cifras de «Así va el soporte hoy». Avisan de lo que va mal con texto («Por encima del objetivo de 30 min»,
 * «9 llevan más de 4 h») y el tono solo lo refuerza.
 */
export function pulseCells(metrics: PulseMetrics): PulseCell[] {
  const resolved = compareResolved(metrics.resolvedToday, metrics.resolvedYesterday)
  const unassigned = metrics.views.unassigned
  const response = metrics.firstResponseMinutes
  const target = metrics.firstResponseTargetMinutes
  return [
    {
      id: 'open',
      label: 'Tickets abiertos',
      value: String(metrics.open),
      detail: newToday(metrics.openedToday),
      reserve: newToday(999),
      tone: 'neutral',
      to: '/tickets',
    },
    {
      id: 'unassigned',
      label: 'Sin responsable',
      value: String(unassigned),
      detail:
        metrics.unassignedOver4Hours > 0
          ? overFourHours(metrics.unassignedOver4Hours)
          : unassigned > 0
            ? 'Asígnalos desde la bandeja'
            : 'Todos tienen responsable',
      reserve: 'Asígnalos desde la bandeja',
      tone: metrics.unassignedOver4Hours > 0 ? 'danger' : unassigned > 0 ? 'warning' : 'good',
      to: '/tickets?view=unassigned',
    },
    {
      id: 'firstResponse',
      label: 'Primera respuesta',
      value: response === null ? 'Sin datos' : `${response} min`,
      // Espacios duros: el objetivo no se parte entre líneas en celdas estrechas.
      detail:
        response === null
          ? `Objetivo: ${target} min`
          : response > target
            ? `Por encima del objetivo de ${target} min`
            : `Dentro del objetivo de ${target} min`,
      reserve: `Por encima del objetivo de\u00a0${target}\u00a0min`,
      tone: response === null ? 'neutral' : response > target ? 'danger' : 'good',
      // La bandeja no filtra por primera respuesta: los nuevos, los más antiguos primero, son los que aún no la tienen.
      to: '/tickets?status=open&sort=createdAt,asc',
    },
    {
      id: 'resolved',
      label: 'Resueltos hoy',
      value: String(metrics.resolvedToday),
      detail: resolved.text,
      arrow: resolved.arrow ?? undefined,
      reserve: '↓ 100 menos que ayer (100 %)',
      tone: resolved.trend === 'positive' ? 'good' : resolved.trend === 'negative' ? 'warning' : 'neutral',
      to: '/tickets?view=resolved',
    },
  ]
}
