import { Link } from 'react-router'
import {
  Alert,
  BarChart,
  Button,
  buttonClassName,
  EmptyState,
  Metric,
  Skeleton,
  Timeline,
  TicketRow,
  TicketTable,
} from '../../components/ui'
import type { TicketMetrics } from '../../domain/ticket'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { useReportSummary } from '../reports/queries'
import { useTimeZone } from '../session/useTimeZone'
import { toTimelineEvent } from '../tickets/activityText'
import { useRecentActivity, useTicketList, useTicketMetrics } from '../tickets/queries'
import { compareResolved, newToday, requestPoints } from './overviewData'
import { useRetryFocus } from './useRetryFocus'
import styles from './OverviewPage.module.css'

// La ficha dice 10; con 5 se reduce la diferencia de altura entre la actividad y el gráfico.
const ACTIVITY_SIZE = 5
const ATTENTION_PAGE_SIZE = 5

/**
 * Resumen del personal: métricas del día, solicitudes de la última semana, actividad reciente y los tickets que
 * necesitan atención. Cada bloque pide sus datos y gestiona su carga, su error y su vacío por separado, para que el
 * fallo de uno no tape a los demás. La guardia de rol y la redirección de los clientes las pone la ruta.
 */
export function OverviewPage() {
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Resumen"
        description="Tu equipo, tus clientes y lo que necesita atención."
        actions={
          <Link to="/reportes" className={buttonClassName({ variant: 'secondary' })}>
            Ver reportes
          </Link>
        }
      />
      <MetricsSection />
      <div className={styles.panels}>
        <RequestsPanel />
        <ActivityPanel />
      </div>
      <AttentionPanel />
    </div>
  )
}

/** Valores representativos para el esqueleto: solo fijan la altura de las tarjetas, nunca se muestran ni se leen. */
const ghostMetrics: MetricsData = {
  open: 24,
  openedToday: 8,
  // «4 más que ayer (100 %)»: la comparación más larga habitual (porcentaje de tres cifras).
  resolvedToday: 8,
  resolvedYesterday: 4,
  firstResponseMinutes: 18,
  firstResponseTargetMinutes: 30,
  views: { unassigned: 6 },
}

type MetricsData = Pick<
  TicketMetrics,
  'open' | 'openedToday' | 'resolvedToday' | 'resolvedYesterday' | 'firstResponseMinutes' | 'firstResponseTargetMinutes'
> & { views: Pick<TicketMetrics['views'], 'unassigned'> }

/** Las cuatro tarjetas. Con `ghost` llevan una etiqueta vacía: el esqueleto no debe duplicar ningún texto real. */
function metricCards(data: MetricsData, ghost = false) {
  const resolved = compareResolved(data.resolvedToday, data.resolvedYesterday)
  const label = (text: string) => (ghost ? '\u00a0' : text)
  return [
    <Metric key="open" label={label('Tickets abiertos')} value={data.open} detail={newToday(data.openedToday)} />,
    <Metric
      key="resolved"
      label={label('Resueltos hoy')}
      value={data.resolvedToday}
      trend={resolved.trend}
      detail={
        <>
          {resolved.arrow && <span aria-hidden="true">{resolved.arrow} </span>}
          {resolved.text}
        </>
      }
    />,
    <Metric
      key="firstResponse"
      label={label('Primera respuesta')}
      value={data.firstResponseMinutes === null ? 'Sin datos' : `${data.firstResponseMinutes} min`}
      // La ventana es la de `/tickets/metrics` (168 h móviles), no la del informe. Espacios duros: el objetivo no se
      // parte entre líneas en tarjetas estrechas.
      detail={`Mediana de 7 días · Objetivo:\u00a0${data.firstResponseTargetMinutes}\u00a0min`}
    />,
    <Metric
      key="unassigned"
      label={label('Sin responsable')}
      value={data.views.unassigned}
      detail={
        <Link to="/tickets?view=unassigned" className={styles.link}>
          Ver sin asignar
        </Link>
      }
    />,
  ]
}

function MetricsSection() {
  const metrics = useTicketMetrics()
  const focus = useRetryFocus<HTMLDivElement>(metrics.isSuccess)
  // El esqueleto dibuja las mismas tarjetas, ocultas, con valores representativos: ocupan lo mismo que las reales en
  // cualquier ancho y fuente, y lo de debajo no salta cuando llegan los datos. Encima va el esqueleto visible.
  if (metrics.isPending) {
    return (
      <div className={styles.metrics}>
        {metricCards(ghostMetrics, true).map((card, index) => (
          <div key={card.key} className={styles.ghost}>
            <div className={styles.ghostContent}>{card}</div>
            <Skeleton lines={3} label={index === 0 ? 'Cargando métricas…' : ''} className={styles.ghostSkeleton} />
          </div>
        ))}
      </div>
    )
  }
  if (metrics.isError) {
    return (
      <div className={styles.metrics}>
        <div className={styles.metricsError}>
          <Alert tone="red" title="No pudimos cargar las métricas">
            <Button
              variant="secondary"
              aria-label="Reintentar cargar las métricas"
              onClick={() => focus.retry(metrics.refetch)}
            >
              Reintentar
            </Button>
          </Alert>
        </div>
      </div>
    )
  }
  return (
    <div ref={focus.ref} className={styles.metrics} role="group" aria-label="Métricas del resumen" tabIndex={-1}>
      {metricCards(metrics.data)}
    </div>
  )
}

function RequestsPanel() {
  const report = useReportSummary('7d')
  const focus = useRetryFocus<HTMLElement>(report.isSuccess)
  return (
    <section ref={focus.ref} className={styles.panel} aria-labelledby="overview-requests" tabIndex={-1}>
      <h2 id="overview-requests" className={styles.panelTitle}>
        Solicitudes · Últimos 7 días
      </h2>
      <div className={styles.chart}>
        {report.isPending ? (
          <Skeleton lines={4} label="Cargando el gráfico de solicitudes…" />
        ) : report.isError ? (
          <EmptyState
            kind="error"
            headingLevel={3}
            title="No pudimos cargar las solicitudes"
            description="Revisa tu conexión y vuelve a intentarlo."
            live={report.failureCount > 1}
            action={
              <Button
                variant="secondary"
                aria-label="Reintentar cargar el gráfico de solicitudes"
                onClick={() => focus.retry(report.refetch)}
              >
                Reintentar
              </Button>
            }
          />
        ) : report.data.byDay.every((day) => day.created === 0) ? (
          // `byDay` trae siempre un punto por día, así que sin solicitudes el gráfico sería siete barras vacías.
          <EmptyState
            icon="report"
            headingLevel={3}
            title="Sin solicitudes en los últimos 7 días"
            description="Cuando se cree un ticket, aparecerá aquí."
          />
        ) : (
          <BarChart
            label="Solicitudes por día"
            series={[{ id: 'created', label: 'Solicitudes' }]}
            points={requestPoints(report.data.byDay)}
          />
        )}
      </div>
    </section>
  )
}

function ActivityPanel() {
  const activity = useRecentActivity(ACTIVITY_SIZE)
  const focus = useRetryFocus<HTMLElement>(activity.isSuccess)
  const timeZone = useTimeZone()
  return (
    <section ref={focus.ref} className={styles.panel} aria-labelledby="overview-activity" tabIndex={-1}>
      <h2 id="overview-activity" className={styles.panelTitle}>
        Actividad reciente
      </h2>
      <div className={styles.activity}>
        {activity.isPending ? (
          <Skeleton lines={4} label="Cargando la actividad reciente…" />
        ) : activity.isError ? (
          <EmptyState
            kind="error"
            headingLevel={3}
            title="No pudimos cargar la actividad"
            description="Revisa tu conexión y vuelve a intentarlo."
            live={activity.failureCount > 1}
            action={
              <Button
                variant="secondary"
                aria-label="Reintentar cargar la actividad reciente"
                onClick={() => focus.retry(activity.refetch)}
              >
                Reintentar
              </Button>
            }
          />
        ) : activity.data.length === 0 ? (
          <EmptyState
            icon="bell"
            headingLevel={3}
            title="Sin actividad todavía"
            description="Los cambios en los tickets aparecerán aquí."
          />
        ) : (
          <Timeline
            events={activity.data.map((item) => {
              const event = toTimelineEvent(item.activity, undefined, timeZone, {
                number: item.ticketNumber,
                subject: item.subject,
              })
              return {
                ...event,
                title: (
                  <Link to={`/tickets/${item.ticketNumber}`} className={styles.eventLink}>
                    {event.title}
                  </Link>
                ),
              }
            })}
          />
        )}
      </div>
    </section>
  )
}

function AttentionPanel() {
  const timeZone = useTimeZone()
  const tickets = useTicketList({
    view: 'all',
    status: ['open', 'in_progress'],
    priority: [],
    page: 1,
    pageSize: ATTENTION_PAGE_SIZE,
    // Por rango, no alfabético: `desc` deja primero a los urgentes (verificado contra la API real; `asc` empieza por los bajos).
    sort: 'priority,desc',
  })
  const focus = useRetryFocus<HTMLElement>(tickets.isSuccess)
  return (
    <section
      ref={focus.ref}
      className={`${styles.panel} ${styles.panelFlush}`}
      aria-labelledby="overview-attention"
      tabIndex={-1}
    >
      <div className={styles.panelHeader}>
        <h2 id="overview-attention" className={styles.panelTitle}>
          Necesitan atención
        </h2>
        <Link to="/tickets" className={styles.link}>
          Ver todos
        </Link>
      </div>
      {tickets.isPending ? (
        <div className={styles.tableState}>
          <Skeleton lines={2} label="Cargando los tickets que necesitan atención…" />
          <Skeleton lines={2} label="" />
        </div>
      ) : tickets.isError ? (
        <div className={styles.tableState}>
          <EmptyState
            kind="error"
            headingLevel={3}
            title="No pudimos cargar los tickets"
            description="Revisa tu conexión y vuelve a intentarlo."
            live={tickets.failureCount > 1}
            action={
              <Button
                variant="secondary"
                aria-label="Reintentar cargar los tickets que necesitan atención"
                onClick={() => focus.retry(tickets.refetch)}
              >
                Reintentar
              </Button>
            }
          />
        </div>
      ) : tickets.data.items.length === 0 ? (
        <div className={styles.tableState}>
          <EmptyState
            icon="check"
            headingLevel={3}
            title="Nada pendiente"
            description="No hay tickets abiertos ni en progreso."
          />
        </div>
      ) : (
        <TicketTable label="Tickets que necesitan atención">
          {tickets.data.items.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              to={`/tickets/${ticket.number}`}
              actions={[]}
              timeZone={timeZone}
            />
          ))}
        </TicketTable>
      )}
    </section>
  )
}
