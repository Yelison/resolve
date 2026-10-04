import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { NavItem } from './NavItem'

function renderAt(path: string, ui: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)
}

describe('NavItem', () => {
  it('marca la sección activa', () => {
    renderAt(
      '/tickets/1048',
      <>
        <NavItem to="/" end label="Resumen" icon="home" />
        <NavItem to="/tickets" label="Tickets" icon="ticket" />
      </>,
    )
    expect(screen.getByRole('link', { name: 'Tickets' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Resumen' })).not.toHaveAttribute('aria-current')
  })

  it('colapsado conserva el nombre y muestra un tooltip con el foco', async () => {
    renderAt('/', <NavItem to="/clientes" label="Clientes" icon="clients" collapsed />)
    const link = screen.getByRole('link', { name: 'Clientes' })
    expect(link).not.toHaveTextContent('Clientes')
    await userEvent.tab()
    expect(link).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Clientes')
  })
})
