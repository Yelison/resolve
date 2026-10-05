import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Button } from '../Button/Button'
import { Icon } from '../Icon/Icon'
import { applyFormat, type TextEdit, type TextFormat } from './applyFormat'
import styles from './Editor.module.css'

export type EditorMode = 'reply' | 'note'
export type EditorStatus = 'idle' | 'sending' | 'error'

interface EditorBaseProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Respuesta o nota interna de un ticket: selector de modo y botón de envío. */
export interface TicketEditorProps extends EditorBaseProps {
  /** Discriminante del tipo de editor; 'ticket' es el valor por defecto */
  variant?: 'ticket'
  /** Modo actual: 'reply' (respuesta al cliente) o 'note' (nota interna) */
  mode: EditorMode
  /** Se llama con el modo elegido al cambiar el selector */
  onModeChange: (mode: EditorMode) => void
  /** Se ejecuta al pulsar el botón de envío o con Ctrl/⌘ + Enter; solo si hay texto y no se está enviando */
  onSubmit: () => void
  /** Estado del envío; por defecto 'idle'. 'sending' muestra el botón en carga y 'error' muestra `error` */
  status?: EditorStatus
  /** Mensaje cuando falla el envío; el borrador se conserva. */
  error?: ReactNode
  /** Recibe los archivos elegidos con el botón de adjuntar. */
  onAttach?: (files: File[]) => void
}

/** Cuerpo de un artículo: solo barra de formato y texto; guardar y publicar son del formulario que lo contiene. */
export interface ArticleEditorProps extends EditorBaseProps {
  /** Discriminante del tipo de editor; 'article' muestra solo barra de formato y texto */
  variant: 'article'
  /** Etiqueta accesible del campo de texto. */
  label: string
  /** Texto de ayuda del campo vacío; por defecto «Escribe el artículo en Markdown…» */
  placeholder?: string
  /** Marca el campo como inválido (estilo y `aria-invalid`) */
  invalid?: boolean
  /** Id del mensaje de error o ayuda que describe el campo. */
  describedBy?: string
}

export type EditorProps = TicketEditorProps | ArticleEditorProps

type Tool = { format: TextFormat; label: string; glyph: ReactNode; className?: string }

const ticketTools: Tool[] = [
  { format: 'bold', label: 'Negrita', glyph: 'B', className: styles.bold },
  { format: 'italic', label: 'Cursiva', glyph: 'I', className: styles.italic },
  { format: 'list', label: 'Lista', glyph: '• Lista' },
  { format: 'link', label: 'Enlace', glyph: '↗ Enlace' },
]

const articleTools: Tool[] = [{ format: 'heading', label: 'Encabezado', glyph: 'H2' }, ...ticketTools]

/**
 * Redactor con formato Markdown básico. En el modo de ticket (por defecto) escribe respuestas y notas internas y Ctrl o
 * ⌘ + Enter envía; con `variant="article"` es solo el campo de texto de un artículo, sin selector ni envío.
 */
export function Editor(props: EditorProps) {
  const { value, onChange, className } = props
  const article = props.variant === 'article'
  const mode = article ? 'reply' : props.mode
  const status = article ? 'idle' : (props.status ?? 'idle')
  const onAttach = article ? undefined : props.onAttach
  const tools = article ? articleTools : ticketTools
  const id = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<TextEdit | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toolRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [activeToolState, setActiveTool] = useState(0)
  const toolCount = tools.length + (onAttach ? 1 : 0)
  const activeTool = Math.min(activeToolState, toolCount - 1)
  const sending = status === 'sending'
  const canSubmit = value.trim().length > 0 && !sending
  const label = article ? props.label : mode === 'reply' ? 'Respuesta al cliente' : 'Nota interna'

  function format(kind: TextFormat) {
    const textarea = textareaRef.current
    if (!textarea) return
    const edit = applyFormat(value, textarea.selectionStart, textarea.selectionEnd, kind)
    pendingSelection.current = edit
    onChange(edit.value)
  }

  // Restaura la selección cuando el valor formateado llega al textarea, aunque el padre lo aplique más tarde.
  useLayoutEffect(() => {
    const pending = pendingSelection.current
    const textarea = textareaRef.current
    if (!pending || !textarea || pending.value !== value) return
    pendingSelection.current = null
    textarea.focus()
    textarea.setSelectionRange(pending.selectionStart, pending.selectionEnd)
  }, [value])

  function onTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (!article && canSubmit) props.onSubmit()
    }
  }

  // Barra de herramientas con una sola parada de tabulación y flechas, según el patrón APG.
  function onToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const count = toolCount
    if (event.altKey || event.ctrlKey || event.metaKey) return
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = (activeTool + 1) % count
        break
      case 'ArrowLeft':
        next = (activeTool - 1 + count) % count
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = count - 1
        break
      default:
        return
    }
    event.preventDefault()
    setActiveTool(next)
    toolRefs.current[next]?.focus()
  }

  return (
    <div
      className={cx(
        styles.editor,
        mode === 'note' && styles.note,
        article && styles.article,
        article && props.invalid && styles.invalid,
        className,
      )}
    >
      {!article && (
        <fieldset className={styles.modes}>
          <legend className="visually-hidden">Tipo de respuesta</legend>
          {(['reply', 'note'] as const).map((option) => (
            <label key={option} className={styles.mode}>
              <input
                type="radio"
                name={`${id}-mode`}
                className="visually-hidden"
                checked={mode === option}
                onChange={() => props.onModeChange(option)}
              />
              {option === 'reply' ? 'Responder al cliente' : 'Nota interna'}
            </label>
          ))}
        </fieldset>
      )}

      <div
        role="toolbar"
        aria-label="Formato"
        aria-controls={`${id}-text`}
        className={styles.toolbar}
        onKeyDown={onToolbarKeyDown}
      >
        {tools.map((tool, index) => (
          <button
            key={tool.format}
            ref={(node) => {
              toolRefs.current[index] = node
            }}
            type="button"
            className={cx(styles.tool, tool.className)}
            aria-label={tool.label}
            tabIndex={index === activeTool ? 0 : -1}
            onFocus={() => setActiveTool(index)}
            onClick={() => format(tool.format)}
          >
            {tool.glyph}
          </button>
        ))}
        {onAttach && (
          <>
            <span className={styles.separator} aria-hidden="true" />
            <button
              type="button"
              className={styles.tool}
              ref={(node) => {
                toolRefs.current[tools.length] = node
              }}
              aria-label="Adjuntar archivo"
              tabIndex={activeTool === tools.length ? 0 : -1}
              onFocus={() => setActiveTool(tools.length)}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="attach" />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                onAttach(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
          </>
        )}
      </div>

      <label htmlFor={`${id}-text`} className="visually-hidden">
        {label}
      </label>
      <textarea
        ref={textareaRef}
        id={`${id}-text`}
        className={styles.textarea}
        value={value}
        placeholder={
          article
            ? (props.placeholder ?? 'Escribe el artículo en Markdown…')
            : mode === 'reply'
              ? 'Escribe tu respuesta…'
              : 'Escribe una nota para el equipo…'
        }
        aria-invalid={article && props.invalid ? true : undefined}
        aria-describedby={article ? props.describedBy : `${id}-hint${status === 'error' ? ` ${id}-error` : ''}`}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onTextareaKeyDown}
      />

      {!article && (
        <div className={styles.footer}>
          <Button icon="send" loading={sending} disabled={!canSubmit && !sending} onClick={props.onSubmit}>
            {mode === 'reply' ? 'Enviar respuesta' : 'Guardar nota'}
          </Button>
          {status === 'error' ? (
            <p id={`${id}-error`} className={styles.error} role="alert">
              {props.error ?? 'Error al enviar · Borrador guardado'}
            </p>
          ) : null}
          <p id={`${id}-hint`} className={styles.hint}>
            Ctrl o ⌘ + Enter para enviar
          </p>
        </div>
      )}
    </div>
  )
}
