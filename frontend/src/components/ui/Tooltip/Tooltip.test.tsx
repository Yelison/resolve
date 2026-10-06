import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Tooltip } from './Tooltip'

function renderTooltip(describe = true) {
  return render(
    <Tooltip content="Tickets" describe={describe}>
      {(trigger) => (
        <a href="/tickets" aria-label={describe ? undefined : 'Tickets'} {...trigger}>
          T
        </a>
      )}
    </Tooltip>,
  )
}

describe('Tooltip', () => {
  it('aparece con el foco y describe al disparador', async () => {
    renderTooltip()
    await userEvent.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tickets')
    expect(screen.getByRole('link')).toHaveAccessibleDescription('Tickets')
  })

  it('no duplica la descripción cuando el nombre ya es el mismo texto', async () => {
    renderTooltip(false)
    await userEvent.tab()
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tickets' })).not.toHaveAttribute('aria-describedby')
  })

  it('se oculta con Escape sin mover el foco', async () => {
    renderTooltip()
    await userEvent.tab()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveFocus()
  })

  it('aparece con el puntero y se va poco después de salir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderTooltip()
    await user.hover(screen.getByRole('link'))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await user.unhover(screen.getByRole('link'))
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  describe('varios disparadores', () => {
    function renderTrio() {
      return render(
        <>
          {['Resumen', 'Tickets', 'Clientes'].map((label) => (
            <Tooltip key={label} content={label} describe={false}>
              {(trigger) => (
                <a href={`/${label}`} aria-label={label} {...trigger}>
                  {label[0]}
                </a>
              )}
            </Tooltip>
          ))}
        </>,
      )
    }

    it('al pasar rápido el puntero por tres iconos solo queda visible la etiqueta del último', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderTrio()
      await user.hover(screen.getByRole('link', { name: 'Resumen' }))
      await user.hover(screen.getByRole('link', { name: 'Tickets' }))
      await user.hover(screen.getByRole('link', { name: 'Clientes' }))
      // Sin esperar el margen de cierre: las etiquetas anteriores no pueden seguir en pantalla.
      expect(screen.getAllByRole('tooltip')).toHaveLength(1)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Clientes')
      vi.useRealTimers()
    })

    it('el puntero sobre otro icono sustituye la etiqueta de un icono que conserva el foco', async () => {
      renderTrio()
      await userEvent.tab()
      expect(screen.getByRole('tooltip')).toHaveTextContent('Resumen')
      await userEvent.hover(screen.getByRole('link', { name: 'Tickets' }))
      expect(screen.getAllByRole('tooltip')).toHaveLength(1)
      expect(screen.getByRole('tooltip')).toHaveTextContent('Tickets')
    })
  })
})
