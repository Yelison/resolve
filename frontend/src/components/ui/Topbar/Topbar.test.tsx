import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { Topbar, type TopbarProps } from './Topbar'

function renderTopbar(props: Partial<TopbarProps> = {}) {
  return render(
    <MemoryRouter>
      <Topbar theme="light" onToggleTheme={() => {}} onSearch={() => {}} {...props} />
    </MemoryRouter>,
  )
}

describe('Topbar · acciones', () => {
  it('no muestra ningún avatar ni menú de cuenta: el perfil vive en el sidebar', () => {
    const { container } = renderTopbar()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cuenta/ })).not.toBeInTheDocument()
    expect(container.querySelector('[class*="avatar"]')).toBeNull()
  })

  it('termina en el tema, sin campana de notificaciones, en escritorio y en la barra móvil', () => {
    const { container, unmount } = renderTopbar()
    const actions = container.querySelector('header')!.lastElementChild!
    expect(actions.lastElementChild).toBe(screen.getByRole('button', { name: 'Cambiar a tema oscuro' }))
    expect(screen.queryByRole('button', { name: 'Notificaciones' })).not.toBeInTheDocument()
    unmount()
    const compact = renderTopbar({ menuButton: { expanded: false, controls: 'drawer', onClick: () => {} } })
    const compactActions = compact.container.querySelector('header')!.lastElementChild!
    expect(compactActions.lastElementChild).toBe(screen.getByRole('button', { name: 'Cambiar a tema oscuro' }))
  })
})

describe('Topbar · búsqueda', () => {
  const menuButton = { expanded: false, controls: 'drawer', onClick: () => {} }

  it('en escritorio el botón de búsqueda muestra el atajo y abre un diálogo', async () => {
    const onSearch = vi.fn()
    renderTopbar({ onSearch })
    const button = screen.getByRole('button', { name: /^Buscar…/ })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K')
    await userEvent.click(button)
    expect(onSearch).toHaveBeenCalledOnce()
  })

  it('en la barra móvil la búsqueda es un botón de icono antes del tema', async () => {
    const onSearch = vi.fn()
    const { container } = renderTopbar({ onSearch, menuButton })
    const button = screen.getByRole('button', { name: 'Buscar' })
    expect(button.nextElementSibling).toBe(screen.getByRole('button', { name: 'Cambiar a tema oscuro' }))
    expect(container.querySelector('header')!.lastElementChild!.firstElementChild).toBe(button)
    await userEvent.click(button)
    expect(onSearch).toHaveBeenCalledOnce()
  })

  it('entrega el botón de búsqueda de cada barra para devolverle el foco', () => {
    const desktop = createRef<HTMLButtonElement>()
    const { unmount } = renderTopbar({ searchRef: desktop })
    expect(desktop.current).toBe(screen.getByRole('button', { name: /^Buscar…/ }))
    unmount()
    const mobile = createRef<HTMLButtonElement>()
    renderTopbar({ searchRef: mobile, menuButton })
    expect(mobile.current).toBe(screen.getByRole('button', { name: 'Buscar' }))
  })
})
