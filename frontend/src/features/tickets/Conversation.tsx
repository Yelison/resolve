import { useState } from 'react'
import {
  Button,
  Editor,
  EmptyState,
  Message,
  Skeleton,
  useToast,
  type EditorMode,
  type EditorStatus,
} from '../../components/ui'
import type { Ticket } from '../../domain/ticket'
import { cx } from '../../lib/cx'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { demoErrorMessage, isLockTimeout } from '../../lib/mutationError'
import { useDraft } from '../../lib/useDraft'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { useTimeZone } from '../session/useTimeZone'
import { useAddMessage, useTicketMessages } from './queries'
import styles from './Conversation.module.css'

/** Descripción, mensajes y, para el personal, el compositor: la comparten el detalle y la vista previa de la bandeja. */
export function Conversation({
  ticket,
  isStaff,
  className,
}: {
  ticket: Pick<Ticket, 'number' | 'description'>
  isStaff: boolean
  className?: string
}) {
  const timeZone = useTimeZone()
  const messages = useTicketMessages(ticket.number)
  return (
    <div className={cx(styles.conversation, className)}>
      <section className={styles.description} aria-label="Descripción">
        <p className={styles.descriptionLabel}>Descripción</p>
        <p className={styles.descriptionBody}>{ticket.description}</p>
      </section>
      {messages.isPending && <Skeleton lines={3} label="Cargando conversación…" />}
      {messages.isError && (
        <EmptyState
          kind="error"
          headingLevel={3}
          title="No pudimos cargar la conversación"
          action={
            <Button variant="secondary" onClick={() => void messages.refetch()}>
              Reintentar
            </Button>
          }
        />
      )}
      {messages.data?.map((message) => (
        <Message
          key={message.id}
          kind={message.visibility === 'internal' ? 'note' : message.author.kind}
          author={message.author.name}
          sentAt={new Date(message.createdAt)}
          timeZone={timeZone}
        >
          {message.body}
        </Message>
      ))}
      {isStaff && <Composer number={ticket.number} />}
    </div>
  )
}

function Composer({ number }: { number: number }) {
  const [draft, setDraft] = useDraft(`resolve-draft-${number}`)
  const [mode, setMode] = useState<EditorMode>('reply')
  const addMessage = useAddMessage(number)
  const submission = useRepeatableSubmission()
  const toast = useToast()
  // Un 503 de bloqueo lo explica su aviso con «Reintentar», no el error genérico del editor.
  const status: EditorStatus = addMessage.isPending
    ? 'sending'
    : addMessage.isError && !isLockTimeout(addMessage.error)
      ? 'error'
      : 'idle'

  function submit() {
    const sent = draft
    const message = { body: sent, visibility: mode === 'reply' ? ('public' as const) : ('internal' as const) }
    const success = mode === 'reply' ? 'Respuesta enviada' : 'Nota guardada'
    submission.send(() =>
      addMessage.mutate(message, {
        onSuccess: () => {
          // Solo se vacía si no se escribió nada nuevo mientras se enviaba.
          setDraft((current) => (current === sent ? '' : current))
          toast.show({ title: success })
        },
      }),
    )
  }

  return (
    <>
      <LockTimeoutAlert
        error={addMessage.error}
        pending={addMessage.isPending}
        onRetry={submission.retry}
        what="enviar el mensaje"
      />
      <Editor
        value={draft}
        onChange={(value) => {
          setDraft(value)
          if (addMessage.isError) addMessage.reset()
        }}
        mode={mode}
        onModeChange={(next) => {
          setMode(next)
          // El reintento repetiría el modo anterior (una nota como respuesta al cliente o al revés): se retira el aviso y
          // el envío normal usa lo que muestra la pantalla.
          if (isLockTimeout(addMessage.error)) addMessage.reset()
        }}
        onSubmit={submit}
        status={status}
        error={demoErrorMessage(addMessage.error)}
      />
    </>
  )
}
