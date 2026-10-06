import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { LockTimeoutAlert } from './LockTimeoutAlert'
import { isLockTimeout, LOCK_RETRY_DELAY_MS, LOCK_TIMEOUT_MESSAGE, mutationErrorDetail } from './mutationError'

const busy = () => new ApiError(503, { status: 503, title: 'Recurso ocupado', detail: 'Otra operación…' })
const maintenance = () =>
  new ApiError(503, { status: 503, title: 'Reinicio de la demostración en curso', detail: 'Vuelve en unos minutos.' })
const down = () => new ApiError(503, { status: 503, title: 'Service Unavailable' })

describe('isLockTimeout', () => {
  it('reconoce el 503 «Recurso ocupado» y nada más', () => {
    expect(isLockTimeout(busy())).toBe(true)
    expect(isLockTimeout(down())).toBe(false)
    // El otro 503 del contrato (mantenimiento de la demostración) no es un bloqueo: repetir enseguida no sirve.
    expect(isLockTimeout(maintenance())).toBe(false)
    expect(isLockTimeout(new ApiError(409, { status: 409, title: 'Recurso ocupado' }))).toBe(false)
    expect(isLockTimeout(new Error('Recurso ocupado'))).toBe(false)
    expect(isLockTimeout(null)).toBe(false)
  })

  it('el texto de error de una mutación usa el aviso de bloqueo solo para ese 503', () => {
    expect(mutationErrorDetail(busy())).toBe(LOCK_TIMEOUT_MESSAGE)
    expect(mutationErrorDetail(down())).toBe('Revisa tu conexión e inténtalo de nuevo.')
  })
})

describe('LockTimeoutAlert', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const props = { pending: false, onRetry: () => {}, what: 'guardar el ticket' }

  it('no muestra nada sin un 503 de bloqueo', () => {
    const { container, rerender } = render(<LockTimeoutAlert {...props} error={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<LockTimeoutAlert {...props} error={down()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<LockTimeoutAlert {...props} error={maintenance()} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument()
  })

  it('avisa en una región viva y no se activa hasta pasado Retry-After', async () => {
    const user = setup()
    const onRetry = vi.fn()
    render(<LockTimeoutAlert {...props} onRetry={onRetry} error={busy()} />)
    expect(screen.getByRole('status')).toHaveTextContent(LOCK_TIMEOUT_MESSAGE)
    const button = screen.getByRole('button', { name: 'Reintentar guardar el ticket' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    await user.click(button)
    expect(onRetry).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(LOCK_RETRY_DELAY_MS)
    })
    expect(button).not.toHaveAttribute('aria-disabled')
    await user.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('el botón sigue enfocable mientras espera: aria-disabled no le quita el foco', async () => {
    const user = setup()
    render(<LockTimeoutAlert {...props} error={busy()} />)
    const button = screen.getByRole('button', { name: 'Reintentar guardar el ticket' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveFocus()
    await user.tab()
    await user.tab({ shift: true })
    expect(button).toHaveFocus()
  })

  it('al repetir, el aviso y el botón siguen montados con el foco y vuelve a esperar si falla otra vez', () => {
    const first = busy()
    const { rerender } = render(<LockTimeoutAlert {...props} error={first} />)
    act(() => {
      vi.advanceTimersByTime(LOCK_RETRY_DELAY_MS)
    })
    const button = screen.getByRole('button', { name: 'Reintentar guardar el ticket' })
    button.focus()

    rerender(<LockTimeoutAlert {...props} error={null} pending />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveTextContent('Reintentando…')

    rerender(<LockTimeoutAlert {...props} error={busy()} />)
    expect(button).toHaveFocus()
    expect(button).toHaveTextContent('Reintentar')
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  it('desaparece cuando el reintento sale bien', () => {
    const { container, rerender } = render(<LockTimeoutAlert {...props} error={busy()} />)
    rerender(<LockTimeoutAlert {...props} error={null} pending />)
    rerender(<LockTimeoutAlert {...props} error={null} pending={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('si el foco cayó en body al fallar, pasa a «Reintentar»; si está en otro sitio, no se mueve', () => {
    const { rerender } = render(
      <>
        <input aria-label="Asunto" />
        <LockTimeoutAlert {...props} error={null} />
      </>,
    )
    rerender(
      <>
        <input aria-label="Asunto" />
        <LockTimeoutAlert {...props} error={busy()} />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Reintentar guardar el ticket' })).toHaveFocus()
  })

  it('con el foco en otro elemento, el aviso no se lo quita', () => {
    const { rerender } = render(
      <>
        <input aria-label="Asunto" />
        <LockTimeoutAlert {...props} error={null} />
      </>,
    )
    screen.getByRole('textbox', { name: 'Asunto' }).focus()
    rerender(
      <>
        <input aria-label="Asunto" />
        <LockTimeoutAlert {...props} error={busy()} />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Asunto' })).toHaveFocus()
  })

  it('al irse con el foco dentro, el foco pasa al título de la página y no a body', () => {
    const { rerender } = render(
      <>
        <h1>Ticket</h1>
        <LockTimeoutAlert {...props} error={busy()} />
      </>,
    )
    screen.getByRole('button', { name: 'Reintentar guardar el ticket' }).focus()
    rerender(
      <>
        <h1>Ticket</h1>
        <LockTimeoutAlert {...props} error={null} pending />
      </>,
    )
    rerender(
      <>
        <h1>Ticket</h1>
        <LockTimeoutAlert {...props} error={null} pending={false} />
      </>,
    )
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('heading', { name: 'Ticket' })).toHaveFocus()
  })

  it('no mueve el foco si se va estando en otro sitio', () => {
    const { rerender } = render(
      <>
        <h1>Ticket</h1>
        <input aria-label="Asunto" />
        <LockTimeoutAlert {...props} error={busy()} />
      </>,
    )
    screen.getByRole('textbox', { name: 'Asunto' }).focus()
    rerender(
      <>
        <h1>Ticket</h1>
        <input aria-label="Asunto" />
        <LockTimeoutAlert {...props} error={null} pending={false} />
      </>,
    )
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('textbox', { name: 'Asunto' })).toHaveFocus()
  })

  it('desaparece si el reintento recibe otro error, que se muestra con su propio aviso', () => {
    const { container, rerender } = render(<LockTimeoutAlert {...props} error={busy()} />)
    rerender(<LockTimeoutAlert {...props} error={null} pending />)
    rerender(
      <LockTimeoutAlert
        {...props}
        error={new ApiError(412, { status: 412, title: 'Conflicto de versión' })}
        pending={false}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
