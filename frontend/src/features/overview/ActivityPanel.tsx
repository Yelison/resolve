import { useId, useState } from 'react'
import { Link } from 'react-router'
import { Button, EmptyState, Timeline } from '../../components/ui'
import { useTimeZone } from '../session/useTimeZone'
import { toTimelineEvent } from '../tickets/activityText'
import { useRecentActivity } from '../tickets/queries'
import { BlockError } from './BlockError'
import { Ghost } from './Ghost'
import { useRetryFocus } from './useRetryFocus'
import styles from './SidePanels.module.css'

/** Cuántos eventos se ven al principio. */
export const ACTIVITY_SIZE = 5

/** Cuántos se piden: los de «Ver más actividad» llegan con la primera petición, sin una segunda espera. */
const ACTIVITY_REQUEST = 20

/**
 * Cinco eventos de dos líneas: lo habitual en una organización con actividad. Con menos eventos, o con títulos más cortos o
 * más largos, el bloque cambia de altura al llegar los datos.
 */
const ghostEvents = Array.from({ length: ACTIVITY_SIZE }, (_, index) => ({
  id: `ghost-${index}`,
  kind: 'status' as const,
  title: 'Nombre Apellido cambió el estado a En progreso · #1047 Pago rechazado',
  at: new Date(0),
  timeLabel: 'Hoy, 21:09',
}))

/**
 * «Actividad reciente»: los 5 últimos eventos de la organización. «Ver más actividad» amplía la lista en la misma página
 * (hasta 20) y el botón pasa a «Ver menos»; el foco se queda en él.
 */
export function ActivityPanel() {
  const activity = useRecentActivity(ACTIVITY_REQUEST)
  const focus = useRetryFocus<HTMLElement>(activity.isSuccess)
  const timeZone = useTimeZone()
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const events = activity.data
  const visible = events ? (expanded ? events : events.slice(0, ACTIVITY_SIZE)) : []
  return (
    <section ref={focus.ref} className={styles.panel} aria-labelledby="overview-activity" tabIndex={-1}>
      <h2 id="overview-activity" className={styles.title}>
        Actividad reciente
      </h2>
      {activity.isPending ? (
        <Ghost label="Cargando la actividad reciente…">
          <Timeline events={ghostEvents} />
        </Ghost>
      ) : activity.isError ? (
        <div className={styles.state}>
          <BlockError
            error={activity.error}
            failureCount={activity.failureCount}
            title="No pudimos cargar la actividad"
            restrictedTitle="No tienes permiso para ver la actividad"
            retryLabel="Reintentar cargar la actividad reciente"
            onRetry={() => focus.retry(activity.refetch)}
          />
        </div>
      ) : events!.length === 0 ? (
        <EmptyState
          icon="bell"
          headingLevel={3}
          title="Sin actividad todavía"
          description="Los cambios en los tickets aparecerán aquí."
        />
      ) : (
        <>
          <div id={listId}>
            <Timeline
              events={visible.map((item) => {
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
          </div>
          {events!.length > ACTIVITY_SIZE && (
            <Button
              variant="ghost"
              className={styles.more}
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? 'Ver menos actividad' : 'Ver más actividad'}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
