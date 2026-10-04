import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './ToastProvider'
import { useToast, type ToastOptions } from './toastContext'

function Trigger(options: ToastOptions) {
  const toast = useToast()
  return <button onClick={() => toast.show(options)}>Mostrar</button>
}

function renderWithToast(options: ToastOptions) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <ToastProvider>
      <Trigger {...options} />
    </ToastProvider>,
  )
  return user
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('anuncia la notificación dentro de una región viva', async () => {
    const user = renderWithToast({ title: 'Cambios guardados', description: 'Tu equipo verá la actualización.' })
    await user.click(screen.getByRole('button', { name: 'Mostrar' }))
    const region = screen.getByRole('region', { name: 'Notificaciones' })
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('Cambios guardados')
  })

  it('se cierra sola tras la duración indicada', async () => {
    const user = renderWithToast({ title: 'Cambios guardados', duration: 3000 })
    await user.click(screen.getByRole('button', { name: 'Mostrar' }))
    act(() => vi.advanceTimersByTime(2500))
    expect(screen.getByText('Cambios guardados')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(600))
    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
  })

  it('pausa el cierre mientras el puntero está encima', async () => {
    const user = renderWithToast({ title: 'No se pudo enviar', tone: 'error', duration: 1000 })
    await user.click(screen.getByRole('button', { name: 'Mostrar' }))
    await user.hover(screen.getByText('No se pudo enviar'))
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText('No se pudo enviar')).toBeInTheDocument()
    await user.unhover(screen.getByText('No se pudo enviar'))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByText('No se pudo enviar')).not.toBeInTheDocument()
  })

  it('sigue pausado si el foco sale mientras el puntero continúa encima', async () => {
    const user = renderWithToast({ title: 'No se pudo enviar', tone: 'error', duration: 1000 })
    await user.click(screen.getByRole('button', { name: 'Mostrar' }))
    await user.hover(screen.getByText('No se pudo enviar'))
    await user.tab()
    await user.tab()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText('No se pudo enviar')).toBeInTheDocument()
  })

  it('se puede cerrar con su botón', async () => {
    const user = renderWithToast({ title: 'Cambios guardados' })
    await user.click(screen.getByRole('button', { name: 'Mostrar' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
  })

  it('exige el proveedor', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger title="Hola" />)).toThrow('useToast debe usarse dentro de <ToastProvider>')
  })
})
