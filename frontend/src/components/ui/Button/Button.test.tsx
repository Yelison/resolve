import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, IconButton } from './Button'

describe('Button', () => {
  it('no envía formularios por defecto', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('type', 'button')
  })

  it('ejecuta onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Guardar</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('bloquea pulsaciones repetidas mientras carga y sigue siendo enfocable', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Enviar
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Enviando…' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).not.toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('no responde cuando está deshabilitado', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('IconButton', () => {
  it('expone su etiqueta como nombre accesible', () => {
    render(<IconButton icon="bell" label="Notificaciones" />)
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument()
  })
})
