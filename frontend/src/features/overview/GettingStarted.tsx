import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { GettingStarted } from '../../api/schema'
import { Button, buttonClassName, Icon } from '../../components/ui'
import { cx } from '../../lib/cx'
import { focusPageHeadingIfFocusLost } from '../../lib/focusPageHeading'
import { InviteMemberDialog } from '../team/InviteMemberDialog'
import { ticketKeys, useTicketMetrics } from '../tickets/queries'
import styles from './GettingStarted.module.css'

/** Las métricas leídas hace menos de esto, sin escrituras después, no se vuelven a pedir al montar Inicio. */
const JUST_ARRIVED_MS = 5_000

/** Cuatro pasos: «Crea tu espacio» (siempre hecho) y los tres que el servidor cuenta. */
const TOTAL = 4

export interface GettingStartedPanelProps {
  steps: GettingStarted
  /** Se llama al cerrar el diálogo de invitar (con o sin invitación): el paso se relee del servidor. */
  onInviteClosed: () => void
}

function Step({ done, label, action }: { done: boolean; label: string; action?: ReactNode }) {
  return (
    <li className={cx(styles.step, done && styles.done)}>
      <span className={styles.mark} aria-hidden="true">
        {done && <Icon name="check" size={16} />}
      </span>
      <span className={styles.label}>
        {label}
        {/* El tachado y la marca no se leen: el estado va también en texto. */}
        {done && <span className="visually-hidden"> (hecho)</span>}
      </span>
      {!done && action}
    </li>
  )
}

/**
 * «Primeros pasos» de Inicio: lo que le falta a un espacio recién creado. El servidor decide cuándo se muestra
 * (`gettingStarted` no es `null`) y deja de mandarlo cuando están los tres pasos; aquí no se guarda nada. «Invitar» abre
 * el diálogo de Equipo sobre esta misma página; los otros dos llevan a crear un cliente y a escribir un artículo. Un paso
 * hecho va tachado y con su marca, y sin botón. Si el botón pulsado desaparece al hacerse el paso, el foco pasa al título
 * del panel en lugar de caer en `body`.
 */
export function GettingStartedPanel({ steps, onInviteClosed }: GettingStartedPanelProps) {
  const [inviting, setInviting] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  // «Crea tu espacio» siempre está hecho.
  const done = 1 + [steps.invitedTeam, steps.addedCustomer, steps.publishedArticle].filter(Boolean).length

  // Al hacerse un paso, su botón sale del DOM: si tenía el foco, este pasa al título.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const active = document.activeElement
    if (!active || active === document.body) heading.current?.focus()
  }, [done])

  return (
    <section className={styles.panel} aria-labelledby="getting-started-title">
      <div className={styles.header}>
        <h2 id="getting-started-title" ref={heading} tabIndex={-1} className={styles.title}>
          Primeros pasos
        </h2>
        <p role="status" className={styles.count}>
          {`${done} de ${TOTAL} hechos`}
        </p>
      </div>
      <ul className={styles.steps}>
        <Step done label="Crea tu espacio" />
        <Step
          done={steps.invitedTeam}
          label="Invita a tu equipo"
          action={
            <Button variant="secondary" onClick={() => setInviting(true)}>
              Invitar
            </Button>
          }
        />
        <Step
          done={steps.addedCustomer}
          label="Añade tu primer cliente"
          action={
            <Link to="/clientes/nuevo" className={buttonClassName({ variant: 'secondary' })}>
              Añadir cliente
            </Link>
          }
        />
        <Step
          done={steps.publishedArticle}
          label="Publica un artículo de ayuda"
          action={
            <Link to="/conocimiento/nuevo" className={buttonClassName({ variant: 'secondary' })}>
              Escribir artículo
            </Link>
          }
        />
      </ul>
      <InviteMemberDialog
        open={inviting}
        onClose={() => {
          setInviting(false)
          onInviteClosed()
        }}
      />
    </section>
  )
}

/**
 * El panel con sus datos: `gettingStarted` viaja en las métricas de tickets, que Inicio ya pide. Vive aparte para que lo
 * que cambia al hacerse un paso no vuelva a pintar el resto de la página.
 */
export function GettingStarted() {
  const queryClient = useQueryClient()
  const steps = useTicketMetrics().data?.gettingStarted ?? null
  const showing = steps !== null
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ticketKeys.metrics() })

  // Los pasos se hacen en otras páginas: al volver a Inicio se relee lo que ya estaba en caché, en lugar de enseñar hasta
  // 30 s un paso ya hecho. No se relee si la consulta ya se está pidiendo (estaba obsoleta o es la primera vez) ni si los
  // datos acaban de llegar y desde entonces no terminó bien ninguna escritura (p. ej. las métricas que trae crear el espacio).
  useEffect(() => {
    const cached = queryClient.getQueryData<{ gettingStarted: unknown }>(ticketKeys.metrics())
    if (!cached?.gettingStarted || queryClient.isFetching({ queryKey: ticketKeys.metrics() }) > 0) return
    const updatedAt = queryClient.getQueryState(ticketKeys.metrics())?.dataUpdatedAt ?? 0
    const written = queryClient
      .getMutationCache()
      .getAll()
      .some((mutation) => mutation.state.status === 'success' && mutation.state.submittedAt > updatedAt)
    if (written || Date.now() - updatedAt > JUST_ARRIVED_MS) {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.metrics() })
    }
  }, [queryClient])

  // Al hacerse el último paso el panel desaparece, y con él el botón que tenía el foco.
  const hadSteps = useRef(false)
  useEffect(() => {
    if (hadSteps.current && !showing) focusPageHeadingIfFocusLost()
    hadSteps.current = showing
  }, [showing])

  return steps ? <GettingStartedPanel steps={steps} onInviteClosed={invalidate} /> : null
}
