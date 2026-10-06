import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { cx } from '../../lib/cx'
import type { ParameterReportPeriod as ReportPeriod, ReportSummary } from '../../api/schema'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { BarChart, Button, EmptyState, Metric, ProgressBar, Select, Skeleton } from '../../components/ui'
import { useTimeZone } from '../session/useTimeZone'
import { AgentsTable } from './AgentsTable'
import {
  agentsCsv,
  channelLabels,
  channelValueText,
  chartData,
  compareCount,
  csvFileName,
  formatHours,
  formatMinutes,
  formatRange,
  hasActivity,
  integer,
  resolvedShare,
} from './reportData'
import { downloadCsv } from './csv'
import { DEFAULT_PERIOD, hasInvalidPeriod, periodLabels, readPeriod, reportPeriods, writePeriod } from './periodParams'
import { reportSummaryOptions } from './queries'
import styles from './ReportsPage.module.css'

/**
 * Reportes: cuatro cifras del periodo frente al anterior, solicitudes y resueltos por día, canales y rendimiento por
 * agente, todo de una sola respuesta (`/reports/summary`). El periodo vive en la URL (`?period=30d`); un valor que no
 * existe vuelve al de por defecto. La guardia de rol la pone la ruta.
 */
export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period = readPeriod(searchParams)
  // Al cambiar de periodo se sigue viendo el informe anterior (atenuado y anunciado) en lugar de un esqueleto que mueva la página.
  const report = useQuery({ ...reportSummaryOptions(period), placeholderData: keepPreviousData })
  const timeZone = useTimeZone()

  // Un `?period=foo` se limpia de la URL: el selector ya muestra el periodo por defecto y la URL no debe contradecirlo.
  const invalid = hasInvalidPeriod(searchParams)
  useEffect(() => {
    if (invalid) setSearchParams(writePeriod(searchParams, DEFAULT_PERIOD), { replace: true })
  }, [invalid, searchParams, setSearchParams])

  // Solo se muestran (y se exportan) datos de una consulta correcta: tras un refetch fallido la página enseña el error,
  // no unos datos que ya no se sabe si están vigentes, y el rango y la exportación desaparecen con ellos.
  const data = report.isSuccess ? report.data : undefined
  const updating = report.isPlaceholderData
  const canExport = data !== undefined && !updating && data.byAgent.length > 0

  function exportCsv() {
    if (!data || updating || data.byAgent.length === 0) return
    downloadCsv(csvFileName(period, data.period.to, timeZone), agentsCsv(data.byAgent))
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Reportes"
        description="Mide la calidad del servicio y encuentra oportunidades de mejora."
        actions={
          <Button variant="secondary" disabled={!canExport} onClick={exportCsv}>
            Exportar CSV
          </Button>
        }
      />

      <div className={styles.toolbar}>
        <Select
          label="Periodo"
          value={period}
          fieldClassName={styles.periodField}
          onChange={(event) => setSearchParams(writePeriod(searchParams, event.target.value as ReportPeriod))}
        >
          {reportPeriods.map((value) => (
            <option key={value} value={value}>
              {periodLabels[value]}
            </option>
          ))}
        </Select>
        <p
          className={cx(styles.range, !data && styles.ghost, updating && styles.updating)}
          aria-hidden={data ? undefined : true}
        >
          {formatRange(data?.period ?? ghostRange, timeZone)} · {timeZone}
        </p>
      </div>

      {report.isPending ? (
        <LoadingReport />
      ) : !data ? (
        <EmptyState
          kind="error"
          title="No pudimos cargar el informe"
          description="Revisa tu conexión y vuelve a intentarlo."
          live={report.failureCount > 1}
          action={
            <Button variant="secondary" onClick={() => void report.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : (
        <div className={cx(styles.report, updating && styles.updating)} aria-busy={updating}>
          <Report data={data} />
          <p className="visually-hidden" role="status">
            {updating ? 'Actualizando el informe…' : ''}
          </p>
        </div>
      )}
    </div>
  )
}

/** Valores representativos para el esqueleto: solo fijan la altura de las tarjetas, nunca se muestran ni se leen. */
const ghostRange = { from: '2026-09-28T05:00:00Z', to: '2026-10-04T15:00:00Z' }
const ghostMetrics: Pick<
  ReportSummary,
  'period' | 'created' | 'resolved' | 'firstResponseMinutes' | 'resolutionHours'
> = {
  // La comparación más larga: 90 días, diferencia y porcentaje.
  period: { ...ghostRange, days: 90, timeZone: '' },
  created: { value: 1234, previous: 1000 },
  resolved: { value: 1180, previous: 1000 },
  firstResponseMinutes: { value: 41, previous: 36, target: 30 },
  resolutionHours: { value: 9, previous: 8 },
}

function LoadingReport() {
  // Las mismas tarjetas, ocultas, fijan la altura que tendrán las reales en cualquier ancho y fuente; encima va el
  // esqueleto visible. Así lo de debajo no salta cuando llega el informe.
  const cards = metricCards(ghostMetrics, true)
  return (
    <>
      <div className={styles.metrics}>
        {cards.map((card, index) => (
          <div key={card.key} className={styles.ghostCard}>
            <div className={styles.ghostContent}>{card}</div>
            <Skeleton lines={3} label={index === 0 ? 'Cargando el informe…' : ''} className={styles.ghostSkeleton} />
          </div>
        ))}
      </div>
      <div className={styles.panels} data-testid="report-panels">
        <div className={styles.panel}>
          <Skeleton lines={5} label="" />
        </div>
        <div className={styles.panel}>
          <Skeleton lines={4} label="" />
        </div>
      </div>
      <div className={styles.panel}>
        <Skeleton lines={4} label="" />
      </div>
    </>
  )
}

function Report({ data }: { data: ReportSummary }) {
  return (
    <>
      <Metrics data={data} />
      <div className={styles.panels} data-testid="report-panels">
        <RequestsPanel data={data} />
        <ChannelsPanel data={data} />
      </div>
      <AgentsPanel data={data} />
    </>
  )
}

function Metrics({ data }: { data: ReportSummary }) {
  return <div className={styles.metrics}>{metricCards(data)}</div>
}

/** Las cuatro tarjetas. Con `ghost` llevan una etiqueta vacía: el esqueleto no debe duplicar ningún texto real. */
function metricCards(
  data: Pick<ReportSummary, 'period' | 'created' | 'resolved' | 'firstResponseMinutes' | 'resolutionHours'>,
  ghost = false,
) {
  const label = (text: string) => (ghost ? '\u00a0' : text)
  const created = compareCount(data.created.value, data.created.previous, data.period.days)
  const firstResponse = data.firstResponseMinutes
  const withinTarget = firstResponse.value !== null && firstResponse.value <= firstResponse.target
  return [
    <Metric
      key="created"
      label={label('Solicitudes')}
      value={integer.format(data.created.value)}
      trend={created.trend}
      detail={
        <>
          {created.arrow && <span aria-hidden="true">{created.arrow} </span>}
          {created.text}
        </>
      }
    />,
    <Metric
      key="resolved"
      label={label('Resueltos')}
      value={integer.format(data.resolved.value)}
      detail={resolvedShare(data.resolved.value, data.created.value) ?? undefined}
    />,
    <Metric
      key="firstResponse"
      label={label('Primera respuesta')}
      value={formatMinutes(firstResponse.value)}
      trend={firstResponse.value === null ? 'neutral' : withinTarget ? 'positive' : 'negative'}
      detail={
        firstResponse.value === null
          ? `Objetivo: ${firstResponse.target}\u00a0min`
          : `${withinTarget ? 'Dentro' : 'Por encima'} del objetivo de ${firstResponse.target}\u00a0min`
      }
    />,
    <Metric
      key="resolution"
      label={label('Resolución')}
      value={formatHours(data.resolutionHours.value)}
      detail="Mediana desde la creación"
    />,
  ]
}

function RequestsPanel({ data }: { data: ReportSummary }) {
  const { points, granularity } = chartData(data.byDay)
  const title = granularity === 'week' ? 'Solicitudes y resueltos por semana' : 'Solicitudes y resueltos por día'
  return (
    <section className={styles.panel} aria-labelledby="reports-requests">
      <h2 id="reports-requests" className={styles.panelTitle}>
        {title}
      </h2>
      {hasActivity(data.byDay) ? (
        <>
          <BarChart
            label={title}
            series={[
              { id: 'created', label: 'Solicitudes' },
              { id: 'resolved', label: 'Resueltos' },
            ]}
            points={points}
          />
          {granularity === 'week' && (
            <p className={styles.note}>Una barra por semana; la última puede estar incompleta.</p>
          )}
        </>
      ) : (
        <EmptyState
          icon="report"
          headingLevel={3}
          title="Sin actividad en este periodo"
          description="Cuando se cree o se resuelva un ticket, aparecerá aquí."
        />
      )}
    </section>
  )
}

function ChannelsPanel({ data }: { data: ReportSummary }) {
  return (
    <section className={styles.panel} aria-labelledby="reports-channels">
      <h2 id="reports-channels" className={styles.panelTitle}>
        Solicitudes por canal
      </h2>
      {data.byChannel.length === 0 ? (
        <p className={styles.note}>Ningún ticket se creó en este periodo.</p>
      ) : (
        <div className={styles.channels}>
          {data.byChannel.map((channel) => (
            <ProgressBar
              key={channel.channel}
              label={channelLabels[channel.channel]}
              value={channel.share}
              valueText={channelValueText(channel)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function AgentsPanel({ data }: { data: ReportSummary }) {
  const count = data.byAgent.length
  return (
    <section className={styles.panel} aria-labelledby="reports-agents">
      <h2 id="reports-agents" className={styles.panelTitle}>
        Rendimiento por agente
      </h2>
      {count === 0 ? (
        <EmptyState
          icon="team"
          headingLevel={3}
          title="Sin agentes en este periodo"
          description="Cuando alguien del equipo atienda tickets, aparecerá aquí."
        />
      ) : (
        <div className={styles.agents}>
          <AgentsTable
            agents={data.byAgent}
            caption={count === 1 ? 'Mostrando 1 agente' : `Mostrando ${count} agentes`}
          />
          <p className={styles.note}>Incluye a quien ya no está en el equipo si atendió tickets en el periodo.</p>
        </div>
      )}
    </section>
  )
}
