import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Topbar, type TopbarProps } from './Topbar'

function renderTopbar(props: Partial<TopbarProps> = {}) {
  return render(
    <MemoryRouter>
      <Topbar
        theme="light"
        onToggleTheme={() => {}}
        onSearch={() => {}}
        onNotifications={() => {}}
        userName="Yelisson Ortiz"
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('Topbar · userMenu', () => {
  it('sin userMenu muestra el avatar con su nombre accesible, igual que antes', () => {
    const { container } = renderTopbar()
    expect(screen.getByRole('img', { name: 'Yelisson Ortiz' })).toBeInTheDocument()
    expect(container.querySelector('header')?.lastElementChild?.lastElementChild).toBe(screen.getByRole('img'))
  })

  it('con userMenu entrega el avatar decorativo al control y no lo repite fuera', () => {
    renderTopbar({
      userMenu: (avatar) => (
        <button type="button" aria-label="Cuenta de Yelisson Ortiz">
          {avatar}
        </button>
      ),
    })
    const account = screen.getByRole('button', { name: 'Cuenta de Yelisson Ortiz' })
    expect(account).toHaveTextContent('YO')
    expect(account.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('img', { name: 'Yelisson Ortiz' })).not.toBeInTheDocument()
  })

  it('en la barra móvil el avatar llega en tamaño pequeño', () => {
    renderTopbar({
      menuButton: { expanded: false, controls: 'drawer', onClick: () => {} },
      userMenu: (avatar) => (
        <button type="button" aria-label="Cuenta">
          {avatar}
        </button>
      ),
    })
    expect(screen.getByRole('button', { name: 'Cuenta' }).firstElementChild?.className).toMatch(/small/)
  })
})
