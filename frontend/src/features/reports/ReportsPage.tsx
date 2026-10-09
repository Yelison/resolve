import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { cx } from '../../lib/cx'
import type { ParameterReportPeriod as ReportPeriod, ReportSummary } from '../../api/schema'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import {
  BarChart,
  Button,
  DonutChart,
  DotPlot,
  EmptyState,
  LineChart,
  Metric,
  Select,
  Skeleton,
  Sparkline,
} from '../../components/ui'
import { useTeamMetrics } from '../team/queries'
import { useTimeZone } from '../session/useTimeZone'
import { AgentsTable } from './AgentsTable'
import { FirstResponseBar } from './FirstResponseBar'
import {
  agentResponses,
  agentsCsv,
  channelSegments,
  chartData,
  compareCount,
  csvFileName,
  formatHours,
  formatMinutes,
  formatRange,
  hasActivity,
  integer,
  missingResponsesNote,
  pendingPoints,
  pendingText,
  resolvedShare,
  signedInteger,
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
        <div className={styles.report} aria-busy={updating}>
          <Report data={data} updating={updating} />
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
const ghostDays = [4, 7, 5, 9, 6, 8, 7].map((created, index) => ({
  date: `2026-09-${String(28 + index).padStart(2, '0')}`,
  created,
  resolved: 3,
}))
const ghostMetrics: Pick<
  ReportSummary,
  'period' | 'created' | 'resolved' | 'firstResponseMinutes' | 'resolutionHours' | 'byDay'
> = {
  // La comparación más larga: 90 días, diferencia y porcentaje.
  period: { ...ghostRange, days: 90, timeZone: '' },
  created: { value: 1234, previous: 1000 },
  resolved: { value: 1180, previous: 1000 },
  firstResponseMinutes: { value: 41, previous: 36, target: 30 },
  resolutionHours: { value: 9, previous: 8 },
  byDay: ghostDays,
}

/**
 * Reserva el alto de un panel con una copia oculta (y fuera de la lectura y del foco) de su contenido más alto: el
 * contenido real se superpone en la misma celda. Así lo de debajo no se mueve entre la carga, los datos, el vacío y el
 * error, ni al cambiar de periodo, aunque el contenido real sea más bajo (menos canales, sin actividad…).
 */
function Reserved({ ghost, children }: { ghost: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.reserved}>
      <div className={styles.reserve} aria-hidden="true" inert>
        {ghost}
      </div>
      <div className={styles.live}>{children}</div>
    </div>
  )
}

/** Tamaño del anillo de «Abiertos con y sin responsable» (el de canales usa el tamaño por defecto). */
const ASSIGNED_SIZE = 128

const BLANK = '\u00a0'

/** Contenido más alto posible de cada panel; los textos van en blanco para que no se lean ni dupliquen los reales. */
const ghostPanels = {
  requests: (
    <>
      <BarChart
        label=""
        series={[
          { id: 'created', label: BLANK },
          { id: 'resolved', label: BLANK },
        ]}
        points={ghostDays.map((day) => ({
          key: day.date,
          label: BLANK,
          shortLabel: BLANK,
          values: { created: day.created, resolved: day.resolved },
        }))}
      />
      <p className={styles.note}>{BLANK}</p>
    </>
  ),
  channels: (
    <DonutChart
      label=""
      segments={(['email', 'chat', 'phone', 'web'] as const).map((id, index) => ({
        id,
        label: BLANK,
        value: 4 - index,
        color: (index + 1) as 1 | 2 | 3 | 4,
        valueText: BLANK,
      }))}
      centerValue={BLANK}
      centerLabel={BLANK}
    />
  ),
  backlog: (
    <LineChart
      label=""
      points={ghostDays.map((day) => ({ key: day.date, label: BLANK, shortLabel: BLANK, value: day.created }))}
    />
  ),
  assigned: (
    <DonutChart
      label=""
      size={ASSIGNED_SIZE}
      segments={[
        { id: 'assigned', label: BLANK, value: 3, color: 1, valueText: BLANK },
        { id: 'unassigned', label: BLANK, value: 1, color: 2, valueText: BLANK },
      ]}
      centerValue={BLANK}
    />
  ),
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
        <LoadingPanel ghost={ghostPanels.requests} />
        <LoadingPanel ghost={ghostPanels.channels} />
      </div>
      <div className={styles.panels} data-testid="report-panels-current">
        <LoadingPanel ghost={ghostPanels.backlog} />
        <LoadingPanel ghost={ghostPanels.assigned} />
      </div>
      <div className={styles.panel} data-testid="report-agents">
        <span className={styles.panelTitle}>{BLANK}</span>
        <Skeleton lines={4} label="" />
      </div>
    </>
  )
}

/** Panel sin su título (aún no se sabe, p. ej. «por semana» o «por día») con el esqueleto sobre el alto reservado. */
function LoadingPanel({ ghost }: { ghost: ReactNode }) {
  return (
    <div className={styles.panel}>
      <span className={styles.panelTitle}>{BLANK}</span>
      <Reserved ghost={ghost}>
        <Skeleton lines={5} label="" className={styles.panelSkeleton} />
      </Reserved>
    </div>
  )
}

function Report({ data, updating }: { data: ReportSummary; updating: boolean }) {
  const dim = updating ? styles.updating : undefined
  return (
    <>
      <Metrics data={data} className={dim} />
      <div className={styles.panels} data-testid="report-panels">
        <RequestsPanel data={data} className={dim} />
        <ChannelsPanel data={data} className={dim} />
      </div>
      <div className={styles.panels} data-testid="report-panels-current">
        <BacklogPanel data={data} className={dim} />
        <AssignedPanel />
      </div>
      <AgentsPanel data={data} className={dim} />
    </>
  )
}

function Metrics({ data, className }: { data: ReportSummary; className?: string }) {
  return <div className={cx(styles.metrics, className)}>{metricCards(data)}</div>
}

/** Las cuatro tarjetas. Con `ghost` llevan una etiqueta vacía: el esqueleto no debe duplicar ningún texto real. */
function metricCards(
  data: Pick<ReportSummary, 'period' | 'created' | 'resolved' | 'firstResponseMinutes' | 'resolutionHours' | 'byDay'>,
  ghost = false,
) {
  const label = (text: string) => (ghost ? ' ' : text)
  const created = compareCount(data.created.value, data.created.previous, data.period.days)
  const firstResponse = data.firstResponseMinutes
  const withinTarget = firstResponse.value !== null && firstResponse.value <= firstResponse.target
  return [
    <Metric
      key="created"
      label={label('Solicitudes')}
      value={integer.format(data.created.value)}
      chart={<Sparkline values={data.byDay.map((day) => day.created)} color={1} />}
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
      chart={<Sparkline values={data.byDay.map((day) => day.resolved)} color={2} />}
      detail={resolvedShare(data.resolved.value, data.created.value) ?? undefined}
    />,
    <Metric
      key="firstResponse"
      label={label('Primera respuesta')}
      value={formatMinutes(firstResponse.value)}
      chart={
        <FirstResponseBar value={firstResponse.value} previous={firstResponse.previous} target={firstResponse.target} />
      }
      trend={firstResponse.value === null ? 'neutral' : withinTarget ? 'positive' : 'negative'}
      detail={
        firstResponse.value === null
          ? `Objetivo: ${firstResponse.target} min`
          : `${withinTarget ? 'Dentro' : 'Por encima'} del objetivo de ${firstResponse.target} min`
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

/** Panel con título; `className` lo atenúa mientras llega el informe de otro periodo. */
function Panel({
  id,
  title,
  className,
  children,
}: {
  id: string
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cx(styles.panel, className)} aria-labelledby={id}>
      <h2 id={id} className={styles.panelTitle}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function RequestsPanel({ data, className }: { data: ReportSummary; className?: string }) {
  const { points, granularity } = chartData(data.byDay)
  const title = granularity === 'week' ? 'Solicitudes y resueltos por semana' : 'Solicitudes y resueltos por día'
  return (
    <Panel id="reports-requests" title={title} className={className}>
      <Reserved ghost={ghostPanels.requests}>
        {hasActivity(data.byDay) ? (
          <div className={styles.chartBody}>
            <BarChart
              label={title}
              series={[
                { id: 'created', label: 'Solicitudes', color: 'chart1' },
                { id: 'resolved', label: 'Resueltos', color: 'chart2' },
              ]}
              points={points}
            />
            {granularity === 'week' && (
              <p className={styles.note}>Una barra por semana; la última puede estar incompleta.</p>
            )}
          </div>
        ) : (
          <EmptyState
            icon="report"
            headingLevel={3}
            title="Sin actividad en este periodo"
            description="Cuando se cree o se resuelva un ticket, aparecerá aquí."
          />
        )}
      </Reserved>
    </Panel>
  )
}

function ChannelsPanel({ data, className }: { data: ReportSummary; className?: string }) {
  const { segments, total } = channelSegments(data.byChannel)
  return (
    <Panel id="reports-channels" title="Solicitudes por canal" className={className}>
      <Reserved ghost={ghostPanels.channels}>
        {segments.length === 0 ? (
          <p className={styles.note}>Ningún ticket se creó en este periodo.</p>
        ) : (
          <DonutChart
            label="Solicitudes por canal"
            segments={segments}
            centerValue={integer.format(total)}
            centerLabel={total === 1 ? 'solicitud' : 'solicitudes'}
            valueColumn="Solicitudes"
          />
        )}
      </Reserved>
    </Panel>
  )
}

function BacklogPanel({ data, className }: { data: ReportSummary; className?: string }) {
  const points = pendingPoints(data.byDay)
  const last = points[points.length - 1]
  return (
    <Panel id="reports-backlog" title="Pendientes acumulados" className={className}>
      <Reserved ghost={ghostPanels.backlog}>
        {last && hasActivity(data.byDay) ? (
          <LineChart
            label="Pendientes acumulados"
            points={points}
            valueFormatter={pendingText}
            tickFormatter={signedInteger}
            endLabel={pendingText(last.value)}
            valueColumn="Pendientes"
          />
        ) : (
          <EmptyState
            icon="report"
            headingLevel={3}
            title="Sin actividad en este periodo"
            description="Cuando se cree o se resuelva un ticket, aparecerá aquí."
          />
        )}
      </Reserved>
    </Panel>
  )
}

/** Estado actual, no el del periodo: tiene su propia consulta y su propio error, sin tumbar el resto del informe. */
function AssignedPanel() {
  const team = useTeamMetrics()
  const metrics = team.data
  const open = metrics ? metrics.assignedOpen + metrics.unassignedOpen : 0
  return (
    <Panel id="reports-assigned" title="Abiertos con y sin responsable">
      <Reserved ghost={ghostPanels.assigned}>
        {team.isPending ? (
          <Skeleton lines={5} label="Cargando los tickets abiertos…" className={styles.panelSkeleton} />
        ) : !metrics ? (
          <EmptyState
            kind="error"
            headingLevel={3}
            title="No pudimos cargar los tickets abiertos"
            description="Revisa tu conexión y vuelve a intentarlo."
            live={team.failureCount > 1}
            action={
              <Button variant="secondary" onClick={() => void team.refetch()}>
                Reintentar <span className="visually-hidden">la carga de abiertos con y sin responsable</span>
              </Button>
            }
          />
        ) : open === 0 ? (
          <EmptyState
            icon="ticket"
            headingLevel={3}
            title="No hay tickets abiertos"
            description="Cuando haya tickets sin resolver, aparecerán aquí."
          />
        ) : (
          <DonutChart
            label="Abiertos con y sin responsable"
            size={ASSIGNED_SIZE}
            segments={[
              {
                id: 'assigned',
                label: 'Asignados',
                value: metrics.assignedOpen,
                color: 1,
                valueText: integer.format(metrics.assignedOpen),
              },
              {
                id: 'unassigned',
                label: 'Sin asignar',
                value: metrics.unassignedOpen,
                color: 2,
                valueText: integer.format(metrics.unassignedOpen),
              },
            ]}
            centerValue={integer.format(open)}
            valueColumn="Tickets"
          />
        )}
      </Reserved>
    </Panel>
  )
}

function AgentsPanel({ data, className }: { data: ReportSummary; className?: string }) {
  const count = data.byAgent.length
  const { rows, missing } = agentResponses(data.byAgent)
  const target = data.firstResponseMinutes.target
  return (
    <section className={cx(styles.panel, className)} aria-labelledby="reports-agents" data-testid="report-agents">
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
          {rows.length > 0 && (
            <div className={styles.agentsChart}>
              <h3 className={styles.subtitle}>Primera respuesta frente al objetivo</h3>
              <DotPlot
                label="Primera respuesta frente al objetivo"
                rows={rows}
                target={{ value: target, label: `objetivo ${target} min` }}
                valueFormatter={formatMinutes}
                tickFormatter={integer.format}
                valueColumn="Primera respuesta"
              />
            </div>
          )}
          {missing.length > 0 && <p className={styles.note}>{missingResponsesNote(missing)}</p>}
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
