import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import type { ParameterReportPeriod as ReportPeriod, ReportSummary } from '../../api/schema'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { Alert, BarChart, Button, EmptyState, Metric, ProgressBar, Select, Skeleton } from '../../components/ui'
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
  resolvedShare,
} from './reportData'
import { downloadCsv } from './csv'
import { DEFAULT_PERIOD, hasInvalidPeriod, periodLabels, readPeriod, reportPeriods, writePeriod } from './periodParams'
import { useReportSummary } from './queries'
import styles from './ReportsPage.module.css'

/**
 * Reportes: cuatro cifras del periodo frente al anterior, solicitudes y resueltos por día, canales y rendimiento por
 * agente, todo de una sola respuesta (`/reports/summary`). El periodo vive en la URL (`?period=30d`); un valor que no
 * existe vuelve al de por defecto. La guardia de rol la pone la ruta.
 */
export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period = readPeriod(searchParams)
  const report = useReportSummary(period)
  const timeZone = useTimeZone()

  // Un `?period=foo` se limpia de la URL: el selector ya muestra el periodo por defecto y la URL no debe contradecirlo.
  const invalid = hasInvalidPeriod(searchParams)
  useEffect(() => {
    if (invalid) setSearchParams(writePeriod(searchParams, DEFAULT_PERIOD), { replace: true })
  }, [invalid, searchParams, setSearchParams])

  const data = report.data
  const canExport = data !== undefined && data.byAgent.length > 0

  function exportCsv() {
    if (!data || data.byAgent.length === 0) return
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
        {data && (
          <p className={styles.range}>
            {formatRange(data.period, timeZone)} · {timeZone}
          </p>
        )}
      </div>

      {report.isPending ? (
        <LoadingReport />
      ) : report.isError ? (
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
        <Report data={report.data} />
      )}
    </div>
  )
}

function LoadingReport() {
  return (
    <>
      <div className={styles.metrics}>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton
            key={index}
            lines={3}
            label={index === 0 ? 'Cargando el informe…' : ''}
            className={styles.metricSkeleton}
          />
        ))}
      </div>
      <div className={styles.panels}>
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
      <div className={styles.panels}>
        <RequestsPanel data={data} />
        <ChannelsPanel data={data} />
      </div>
      <AgentsPanel data={data} />
    </>
  )
}

function Metrics({ data }: { data: ReportSummary }) {
  const { days } = data.period
  const created = compareCount(data.created.value, data.created.previous, days)
  const firstResponse = data.firstResponseMinutes
  const withinTarget = firstResponse.value !== null && firstResponse.value <= firstResponse.target
  return (
    <div className={styles.metrics}>
      <Metric
        label="Solicitudes"
        value={data.created.value}
        trend={created.trend}
        detail={
          <>
            {created.arrow && <span aria-hidden="true">{created.arrow} </span>}
            {created.text}
          </>
        }
      />
      <Metric
        label="Resueltos"
        value={data.resolved.value}
        detail={resolvedShare(data.resolved.value, data.created.value) ?? undefined}
      />
      <Metric
        label="Primera respuesta"
        value={formatMinutes(firstResponse.value)}
        trend={firstResponse.value === null ? 'neutral' : withinTarget ? 'positive' : 'negative'}
        detail={
          firstResponse.value === null
            ? `Objetivo: ${firstResponse.target} min`
            : `${withinTarget ? 'Dentro' : 'Por encima'} del objetivo de ${firstResponse.target} min`
        }
      />
      <Metric label="Resolución" value={formatHours(data.resolutionHours.value)} detail="Mediana desde la creación" />
    </div>
  )
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
            <p className={styles.note}>
              Cada barra suma una semana, desde el primer día del periodo; la última puede tener menos días.
            </p>
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
          <Alert tone="blue" title="Quién aparece aquí">
            Además del equipo activo, se incluye a quien ya no está pero resolvió o respondió tickets en el periodo, con
            su estado.
          </Alert>
          <AgentsTable
            agents={data.byAgent}
            caption={count === 1 ? 'Mostrando 1 agente' : `Mostrando ${count} agentes`}
          />
        </div>
      )}
    </section>
  )
}
