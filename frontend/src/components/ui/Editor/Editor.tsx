import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { Button } from '../Button/Button'
import { Icon } from '../Icon/Icon'
import { applyFormat, type TextEdit, type TextFormat } from './applyFormat'
import styles from './Editor.module.css'

export type EditorMode = 'reply' | 'note'
export type EditorStatus = 'idle' | 'sending' | 'error'

export interface EditorProps {
  value: string
  onChange: (value: string) => void
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  onSubmit: () => void
  status?: EditorStatus
  /** Mensaje cuando falla el envío; el borrador se conserva. */
  error?: ReactNode
  /** Recibe los archivos elegidos con el botón de adjuntar. */
  onAttach?: (files: File[]) => void
  className?: string
}

const tools: { format: TextFormat; label: string; glyph: ReactNode; className?: string }[] = [
  { format: 'bold', label: 'Negrita', glyph: 'B', className: styles.bold },
  { format: 'italic', label: 'Cursiva', glyph: 'I', className: styles.italic },
  { format: 'list', label: 'Lista', glyph: '• Lista' },
  { format: 'link', label: 'Enlace', glyph: '↗ Enlace' },
]

/** Redactor de respuestas y notas internas con formato Markdown básico. Ctrl o ⌘ + Enter envía. */
export function Editor({
  value,
  onChange,
  mode,
  onModeChange,
  onSubmit,
  status = 'idle',
  error,
  onAttach,
  className,
}: EditorProps) {
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
  const label = mode === 'reply' ? 'Respuesta al cliente' : 'Nota interna'

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
      if (canSubmit) onSubmit()
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
    <div className={cx(styles.editor, mode === 'note' && styles.note, className)}>
      <fieldset className={styles.modes}>
        <legend className="visually-hidden">Tipo de respuesta</legend>
        {(['reply', 'note'] as const).map((option) => (
          <label key={option} className={styles.mode}>
            <input
              type="radio"
              name={`${id}-mode`}
              className="visually-hidden"
              checked={mode === option}
              onChange={() => onModeChange(option)}
            />
            {option === 'reply' ? 'Responder al cliente' : 'Nota interna'}
          </label>
        ))}
      </fieldset>

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
        placeholder={mode === 'reply' ? 'Escribe tu respuesta…' : 'Escribe una nota para el equipo…'}
        aria-describedby={`${id}-hint${status === 'error' ? ` ${id}-error` : ''}`}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onTextareaKeyDown}
      />

      <div className={styles.footer}>
        <Button icon="send" loading={sending} disabled={!canSubmit && !sending} onClick={onSubmit}>
          {mode === 'reply' ? 'Enviar respuesta' : 'Guardar nota'}
        </Button>
        {status === 'error' ? (
          <p id={`${id}-error`} className={styles.error} role="alert">
            {error ?? 'Error al enviar · Borrador guardado'}
          </p>
        ) : null}
        <p id={`${id}-hint`} className={styles.hint}>
          Ctrl o ⌘ + Enter para enviar
        </p>
      </div>
    </div>
  )
}
