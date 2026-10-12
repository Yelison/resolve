import { Link } from 'react-router'
import { buttonClassName } from '../../components/ui'
import { staff } from '../../app/navigation'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
import { useTimeZone } from '../session/useTimeZone'
import { firstName } from '../tickets/inboxText'
import { ActivityPanel } from './ActivityPanel'
import { AttentionPanel } from './AttentionPanel'
import { DraftsPanel } from './DraftsPanel'
import { formatToday, greetingFor } from './greeting'
import { GettingStarted } from './GettingStarted'
import { PulseStrip } from './PulseStrip'
import { RequestsPanel } from './RequestsPanel'
import { useNow } from './useNow'
import styles from './OverviewPage.module.css'

/**
 * Inicio del personal: qué hay que hacer ahora. Cabecera con el saludo, la franja de «así va el soporte hoy», los
 * tickets que necesitan atención y, al lado, las solicitudes de la semana, la actividad y los borradores. Cada bloque
 * pide sus datos y gestiona su carga, su error y su vacío por separado, para que el fallo de uno no tape a los demás.
 * La guardia de rol y la redirección de los clientes las pone la ruta.
 */
export function OverviewPage() {
  const me = useMe()
  const timeZone = useTimeZone()
  const now = useNow()
  const name = me.data ? firstName(me.data.user.name) : undefined
  // Quien no puede escribir artículos no ve los borradores; mientras `/me` carga, tampoco.
  const canEditArticles = me.data !== undefined && staff.includes(me.data.role)
  const greeting = greetingFor(now, timeZone)
  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.header}>
        <div className={pageStyles.titles}>
          <p className={styles.date}>{formatToday(now, timeZone)}</p>
          <h1 className={pageStyles.title}>{name ? `${greeting}, ${name}` : greeting}</h1>
        </div>
        <div className={styles.actions}>
          <Link to="/reportes" className={buttonClassName({ variant: 'secondary' })}>
            Ver reportes
          </Link>
          <Link to="/tickets/nuevo" className={buttonClassName({ variant: 'primary' })}>
            + Nuevo ticket
          </Link>
        </div>
      </header>
      <GettingStarted />
      <PulseStrip />
      <div className={styles.columns}>
        <AttentionPanel />
        <div className={styles.side}>
          <RequestsPanel />
          <ActivityPanel />
          {canEditArticles && <DraftsPanel />}
        </div>
      </div>
    </div>
  )
}
