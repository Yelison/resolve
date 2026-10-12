import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { Topbar } from '../Topbar/Topbar'
import { Sidebar, type SidebarNavItem } from './Sidebar'

const items: SidebarNavItem[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
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

  it('colapsar y expandir dibujan una flecha doble, y cerrar el drawer una sola', () => {
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
      const arrows = toggle.querySelectorAll('svg').length
      unmount()
      return arrows
    }
    // El giro de «expandir» (`flip`) lo comprueba el e2e de la shell en el navegador: jsdom no carga el CSS del paquete.
    expect(iconsOf('collapse', 'Colapsar menú')).toBe(2)
    expect(iconsOf('expand', 'Expandir menú')).toBe(2)
    expect(iconsOf('close', 'Cerrar menú')).toBe(1)
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

describe('Sidebar · tarjeta del espacio', () => {
  const user = { name: 'Yelisson Ortiz', role: 'Administrador' }
  const base = { items, sectionLabel: 'Gestión', user }

  it('sin `workspaceMenu` es un texto con el cuadro de iniciales y «Espacio de trabajo» de subtítulo', () => {
    render(
      <MemoryRouter>
        <Sidebar {...base} workspace="Acme Studio" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Acme Studio')).toBeInTheDocument()
    expect(screen.getByText('Espacio de trabajo')).toBeInTheDocument()
    expect(screen.getByText('AS')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /espacio/i })).not.toBeInTheDocument()
  })

  it('`workspaceColor` pinta el cuadro de iniciales del espacio; sin él, el cuadro es neutro', () => {
    const { rerender } = render(
      <MemoryRouter>
        <Sidebar {...base} workspace="Acme Studio" workspaceColor="teal" />
      </MemoryRouter>,
    )
    expect(screen.getByText('AS')).toHaveAttribute('data-color', 'teal')
    rerender(
      <MemoryRouter>
        <Sidebar {...base} workspace="Acme Studio" />
      </MemoryRouter>,
    )
    expect(screen.getByText('AS')).not.toHaveAttribute('data-color')
  })

  it('`workspaceRole` sustituye el subtítulo y, sin rol, conserva la línea', () => {
    const { rerender } = render(
      <MemoryRouter>
        <Sidebar {...base} workspace="Acme Studio" workspaceRole="Administrador" />
      </MemoryRouter>,
    )
    expect(screen.getAllByText('Administrador')).toHaveLength(2)
    expect(screen.queryByText('Espacio de trabajo')).not.toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <Sidebar {...base} workspace="Acme Studio" workspaceRole="" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Acme Studio').nextElementSibling?.textContent).toBe('\u00a0')
  })

  it('`workspaceMenu` recibe el contenido, la clase y si está colapsado, y devuelve el disparador', async () => {
    const received: boolean[] = []
    render(
      <MemoryRouter>
        <Sidebar
          {...base}
          workspace="Acme Studio"
          workspaceRole="Administrador"
          workspaceMenu={(workspace) => {
            received.push(workspace.collapsed)
            return (
              <button
                type="button"
                className={workspace.className}
                aria-label="Espacio: Acme Studio. Cambiar de espacio"
              >
                {workspace.content}
              </button>
            )
          }}
        />
      </MemoryRouter>,
    )
    const trigger = screen.getByRole('button', { name: 'Espacio: Acme Studio. Cambiar de espacio' })
    expect(trigger).toHaveTextContent('AS')
    expect(trigger).toHaveTextContent('Acme Studio')
    expect(trigger).toHaveTextContent('Administrador')
    expect(trigger.querySelector('svg')).not.toBeNull()
    expect(received).toEqual([false])
  })

  it('colapsado, el disparador es solo el cuadro de iniciales', () => {
    render(
      <MemoryRouter>
        <Sidebar
          {...base}
          collapsed
          workspace="Acme Studio"
          workspaceMenu={(workspace) => (
            <button type="button" className={workspace.className} aria-label="Espacio: Acme Studio. Cambiar de espacio">
              {workspace.content}
            </button>
          )}
        />
      </MemoryRouter>,
    )
    const trigger = screen.getByRole('button', { name: 'Espacio: Acme Studio. Cambiar de espacio' })
    expect(trigger).toHaveTextContent(/^AS$/)
    expect(trigger.querySelector('svg')).toBeNull()
  })
})
