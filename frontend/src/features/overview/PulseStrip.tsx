import { Link } from 'react-router'
import { Metric } from '../../components/ui'
import { cx } from '../../lib/cx'
import { useTicketMetrics } from '../tickets/queries'
import { BlockError } from './BlockError'
import { Ghost } from './Ghost'
import { pulseCells, type PulseCell, type PulseMetrics } from './pulse'
import { useRetryFocus } from './useRetryFocus'
import styles from './PulseStrip.module.css'

/**
 * Valores del esqueleto: los textos más largos que puede llevar cada celda (la comparación de los resueltos con
 * porcentaje de tres cifras, el aviso de la primera respuesta). Solo fijan la altura; nunca se muestran ni se leen.
 */
const ghostMetrics: PulseMetrics = {
  open: 132,
  openedToday: 18,
  resolvedToday: 200,
  resolvedYesterday: 100,
  unassignedOver4Hours: 0,
  firstResponseMinutes: 42,
  firstResponseTargetMinutes: 30,
  views: { unassigned: 27 },
}

function Cell({ cell, ghost = false }: { cell: PulseCell; ghost?: boolean }) {
  const metric = (
    <Metric
      className={styles.metric}
      label={ghost ? ' ' : cell.label}
      value={cell.value}
      detail={
        <span className={styles[cell.tone]}>
          {cell.arrow && <span aria-hidden="true">{cell.arrow} </span>}
          {cell.detail}
        </span>
      }
    />
  )
  return ghost ? (
    <div className={styles.cell}>{metric}</div>
  ) : (
    <Link to={cell.to} className={cx(styles.cell, styles.link)}>
      {metric}
    </Link>
  )
}

/**
 * «Así va el soporte hoy»: una franja con cuatro datos. Cada uno enlaza a la vista de la bandeja donde se trabaja y
 * dice con texto si algo va mal; el color solo lo refuerza.
 */
export function PulseStrip() {
  const metrics = useTicketMetrics()
  const focus = useRetryFocus<HTMLDivElement>(metrics.isSuccess)

  if (metrics.isError) {
    return (
      <div className={styles.strip}>
        <div className={styles.error}>
          <BlockError
            error={metrics.error}
            failureCount={metrics.failureCount}
            title="No pudimos cargar las métricas"
            restrictedTitle="No tienes permiso para ver las métricas"
            retryLabel="Reintentar cargar las métricas"
            onRetry={() => focus.retry(metrics.refetch)}
            headingLevel={2}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      ref={focus.ref}
      className={styles.strip}
      role="group"
      aria-label="Así va el soporte hoy"
      aria-busy={metrics.isPending}
      tabIndex={-1}
    >
      {metrics.isPending
        ? pulseCells(ghostMetrics).map((cell, index) => (
            <Ghost key={cell.id} label={index === 0 ? 'Cargando las métricas…' : ''} className={styles.ghost}>
              <Cell cell={cell} ghost />
            </Ghost>
          ))
        : pulseCells(metrics.data).map((cell) => <Cell key={cell.id} cell={cell} />)}
    </div>
  )
}
