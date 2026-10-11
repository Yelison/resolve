import { Link } from 'react-router'
import { BarChart, EmptyState } from '../../components/ui'
import { compareCount, integer } from '../reports/reportData'
import { useReportSummary } from '../reports/queries'
import { BlockError } from './BlockError'
import { Ghost } from './Ghost'
import { requestPoints } from './overviewData'
import { useRetryFocus } from './useRetryFocus'
import styles from './SidePanels.module.css'

const series = [{ id: 'created', label: 'Solicitudes' }]

/**
 * Siete días con solicitudes: dan al esqueleto la altura real del gráfico (las cifras sobre las barras ocupan sitio que
 * con todo a cero no se reserva).
 */
const ghostPoints = requestPoints(
  [44, 61, 54, 72, 65, 35, 30].map((created, index) => ({
    date: `2026-01-0${index + 1}`,
    created,
    resolved: 0,
  })),
)

/** La comparación más larga habitual: con ella el esqueleto reserva dos líneas en columnas estrechas. */
const ghostComparison = '↑ 100 más (100 %) frente a los 7 días anteriores'

/**
 * «Solicitudes esta semana»: las de los últimos 7 días con su total y la comparación con los 7 anteriores. El gráfico
 * trae su propia tabla alternativa. La ventana es la del informe de Reportes (7 días móviles, hoy incluido), no la
 * semana natural de lunes a domingo.
 */
export function RequestsPanel() {
  const report = useReportSummary('7d')
  const focus = useRetryFocus<HTMLElement>(report.isSuccess)
  const data = report.data
  const comparison = data ? compareCount(data.created.value, data.created.previous, 7) : undefined
  return (
    <section ref={focus.ref} className={styles.panel} aria-labelledby="overview-requests" tabIndex={-1}>
      <div className={styles.header}>
        <h2 id="overview-requests" className={styles.title}>
          Solicitudes esta semana
        </h2>
        {data && <span className={styles.total}>{integer.format(data.created.value)}</span>}
      </div>
      {report.isPending ? (
        <Ghost label="Cargando las solicitudes de la semana…" contentClassName={styles.ghostStack}>
          <BarChart label="Solicitudes por día" series={series} points={ghostPoints} showEveryLabel />
          <p className={styles.comparison}>{ghostComparison}</p>
        </Ghost>
      ) : report.isError ? (
        <div className={styles.state}>
          <BlockError
            error={report.error}
            failureCount={report.failureCount}
            title="No pudimos cargar las solicitudes"
            restrictedTitle="No tienes permiso para ver las solicitudes"
            retryLabel="Reintentar cargar las solicitudes de la semana"
            onRetry={() => focus.retry(report.refetch)}
          />
        </div>
      ) : data!.byDay.every((day) => day.created === 0) ? (
        // `byDay` trae siempre un punto por día, así que sin solicitudes el gráfico sería siete barras vacías.
        <EmptyState
          icon="report"
          headingLevel={3}
          title="Sin solicitudes esta semana"
          description="Cuando se cree un ticket, aparecerá aquí."
        />
      ) : (
        <>
          <BarChart label="Solicitudes por día" series={series} points={requestPoints(data!.byDay)} showEveryLabel />
          <p className={styles.comparison}>
            {comparison!.arrow && <span aria-hidden="true">{comparison!.arrow} </span>}
            {comparison!.text}
          </p>
        </>
      )}
      <Link to="/reportes" className={styles.link}>
        Ver el detalle en Reportes
      </Link>
    </section>
  )
}
