import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { Topbar } from '../Topbar/Topbar'
import { Sidebar, type SidebarNavItem } from './Sidebar'

const items: SidebarNavItem[] = [
  { to: '/', label: 'Resumen', icon: 'home', end: true },
  { to: '/tickets', label: 'Tickets', icon: 'ticket' },
]

function renderSidebar(collapsed: boolean, onClick = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/tickets']}>
      <Sidebar
        items={items}
        sectionLabel="Gestión"
        workspace="Acme Studio"
        user={{ name: 'Yelisson Ortiz', role: 'Administrador' }}
        collapsed={collapsed}
        action={{ label: collapsed ? 'Expandir menú' : 'Colapsar menú', icon: 'collapse', onClick }}
      />
    </MemoryRouter>,
  )
  return onClick
}

describe('Sidebar', () => {
  it('expandido muestra marca, espacio, secciones y perfil', () => {
    renderSidebar(false)
    expect(screen.getByRole('link', { name: 'Resolve, ir al resumen' })).toBeInTheDocument()
    expect(screen.getByText('Acme Studio')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tickets' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Yelisson Ortiz')).toBeInTheDocument()
  })

  it('colapsado conserva nombres accesibles y la acción', async () => {
    const onClick = renderSidebar(true)
    expect(screen.getByRole('img', { name: 'Espacio de trabajo: Acme Studio' })).toHaveTextContent('AS')
    expect(screen.getByRole('img', { name: 'Yelisson Ortiz' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Expandir menú' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('Topbar', () => {
  it('en móvil muestra el botón de menú y omite búsqueda y notificaciones', () => {
    render(
      <MemoryRouter>
        <Topbar
          theme="light"
          onToggleTheme={() => {}}
          onSearch={() => {}}
          onNotifications={() => {}}
          userName="Yelisson Ortiz"
          menuButton={{ expanded: false, controls: 'drawer', onClick: () => {} }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-controls', 'drawer')
    expect(screen.queryByRole('button', { name: /Buscar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar a tema oscuro' })).toBeInTheDocument()
  })
})
