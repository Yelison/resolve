import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
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
