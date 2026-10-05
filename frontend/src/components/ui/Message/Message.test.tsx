import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Message } from './Message'

const sentAt = new Date('2026-10-04T10:24:00Z')

describe('Message', () => {
  it('se etiqueta con autor y rol, y expone la hora como fecha', () => {
    render(
      <Message kind="customer" author="María Pérez" sentAt={sentAt} footer="Correo electrónico" now={sentAt}>
        Hola, no puedo entrar a mi cuenta.
      </Message>,
    )
    const article = screen.getByRole('article', { name: 'María Pérez · Cliente' })
    expect(article).toHaveTextContent('Hola, no puedo entrar a mi cuenta.')
    expect(screen.getByText('Hoy, 10:24')).toHaveAttribute('datetime', '2026-10-04T10:24:00.000Z')
    expect(article).toHaveTextContent('Correo electrónico')
  })

  it('indica que las notas internas solo las ve el equipo', () => {
    render(
      <Message kind="note" author="Laura Méndez" sentAt={sentAt}>
        Verificar identidad antes de restablecer.
      </Message>,
    )
    expect(screen.getByRole('article', { name: 'Laura Méndez · Nota interna' })).toHaveTextContent(
      'Solo visible para el equipo',
    )
  })

  it('lee «Hoy» y «Ayer» en la zona indicada, no en la del navegador', () => {
    const late = new Date('2026-10-04T05:30:00Z')
    const now = new Date('2026-10-04T12:00:00Z')
    const { rerender } = render(
      <Message kind="agent" author="Laura Méndez" sentAt={late} now={now} timeZone="America/Mexico_City">
        Hola
      </Message>,
    )
    expect(screen.getByText('Ayer, 23:30')).toHaveAttribute('datetime', '2026-10-04T05:30:00.000Z')
    rerender(
      <Message kind="agent" author="Laura Méndez" sentAt={late} now={now} timeZone="Asia/Tokyo">
        Hola
      </Message>,
    )
    expect(screen.getByText('Hoy, 14:30')).toBeInTheDocument()
  })
})
