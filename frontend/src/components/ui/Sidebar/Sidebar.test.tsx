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
        action={{
          label: collapsed ? 'Expandir menú' : 'Colapsar menú',
          kind: collapsed ? 'expand' : 'collapse',
          onClick,
        }}
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
  it('en móvil muestra el botón de menú y el de búsqueda con icono', () => {
    render(
      <MemoryRouter>
        <Topbar
          theme="light"
          onToggleTheme={() => {}}
          onSearch={() => {}}
          menuButton={{ expanded: false, controls: 'drawer', onClick: () => {} }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-controls', 'drawer')
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar a tema oscuro' })).toBeInTheDocument()
  })
})

describe('Sidebar · botón de colapsar', () => {
  it('está en la cabecera, junto a la marca, y no en el pie', () => {
    renderSidebar(false)
    const brand = screen.getByRole('link', { name: 'Resolve, ir al resumen' })
    const toggle = screen.getByRole('button', { name: 'Colapsar menú' })
    expect(toggle.parentElement).toBe(brand.parentElement)
    expect(brand.nextElementSibling).toBe(toggle)
    expect(toggle.compareDocumentPosition(screen.getByRole('navigation', { name: 'Principal' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('anuncia si el menú está expandido y dibuja una flecha doble', () => {
    const { unmount } = render(
      <MemoryRouter>
        <Sidebar
          items={items}
          sectionLabel="Gestión"
          workspace="Acme Studio"
          user={{ name: 'Yelisson Ortiz', role: 'Administrador' }}
          action={{ label: 'Colapsar menú', kind: 'collapse', onClick: () => {} }}
        />
      </MemoryRouter>,
    )
    const toggle = screen.getByRole('button', { name: 'Colapsar menú' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle.querySelectorAll('svg')).toHaveLength(2)
    unmount()
    renderSidebar(true)
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('la doble flecha de colapsar se gira con `flip` al expandir, y cerrar lleva una sola sin girar', () => {
    function iconsOf(kind: 'collapse' | 'expand' | 'close', label: string) {
      const { unmount } = render(
        <MemoryRouter>
          <Sidebar
            items={items}
            sectionLabel="Gestión"
            workspace="Acme Studio"
            user={{ name: 'Yelisson Ortiz', role: 'Administrador' }}
            action={{ label, kind, onClick: () => {} }}
          />
        </MemoryRouter>,
      )
      const toggle = screen.getByRole('button', { name: label })
      const icons = toggle.querySelector('svg')!.parentElement!
      const result = { arrows: icons.querySelectorAll('svg').length, flipped: /flip/.test(icons.className) }
      unmount()
      return result
    }
    expect(iconsOf('collapse', 'Colapsar menú')).toEqual({ arrows: 2, flipped: false })
    expect(iconsOf('expand', 'Expandir menú')).toEqual({ arrows: 2, flipped: true })
    expect(iconsOf('close', 'Cerrar menú')).toEqual({ arrows: 1, flipped: false })
  })

  it('conserva el nombre accesible y llama a onClick al pulsar', async () => {
    const onClick = vi.fn()
    renderSidebar(false, onClick)
    await userEvent.click(screen.getByRole('button', { name: 'Colapsar menú' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('el botón de cerrar del drawer no anuncia estado de expansión', () => {
    render(
      <MemoryRouter>
        <Sidebar
          items={items}
          sectionLabel="Gestión"
          workspace="Acme Studio"
          user={{ name: 'Yelisson Ortiz', role: 'Administrador' }}
          action={{ label: 'Cerrar menú', kind: 'close', onClick: () => {} }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).not.toHaveAttribute('aria-expanded')
  })
})
