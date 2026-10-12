import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Menu, type MenuItem } from './Menu'

function renderMenu(overrides: Partial<Record<string, () => void>> = {}) {
  const items: MenuItem[] = [
    { id: 'assign', label: 'Asignar responsable', onSelect: overrides.assign ?? vi.fn() },
    { id: 'priority', label: 'Cambiar prioridad', onSelect: vi.fn(), disabled: true },
    { id: 'resolve', label: 'Marcar como resuelto', onSelect: overrides.resolve ?? vi.fn() },
    { id: 'delete', label: 'Eliminar ticket', tone: 'danger', onSelect: vi.fn() },
  ]
  render(
    <>
      <Menu label="Acciones del ticket" items={items}>
        {(trigger) => <button {...trigger}>Acciones</button>}
      </Menu>
      <p>Fuera</p>
    </>,
  )
  return screen.getByRole('button', { name: 'Acciones' })
}

describe('Menu', () => {
  it('abre con el teclado y enfoca el primer elemento', async () => {
    const trigger = renderMenu()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Acciones del ticket' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Asignar responsable' })).toHaveFocus()
  })

  it('salta los elementos deshabilitados, da la vuelta y admite búsqueda por letra', async () => {
    const trigger = renderMenu()
    await userEvent.click(trigger)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Marcar como resuelto' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Asignar responsable' })).toHaveFocus()
    await userEvent.keyboard('e')
    expect(screen.getByRole('menuitem', { name: 'Eliminar ticket' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'Asignar responsable' })).toHaveFocus()
  })

  it('ejecuta la acción, se cierra y devuelve el foco', async () => {
    const resolve = vi.fn()
    const trigger = renderMenu({ resolve })
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Marcar como resuelto' }))
    expect(resolve).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('se cierra con Escape y al pulsar fuera', async () => {
    const trigger = renderMenu()
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await userEvent.click(trigger)
    await userEvent.click(screen.getByText('Fuera'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Menu dentro de un dialog modal', () => {
  it('se monta dentro del dialog para seguir visible en el top layer', async () => {
    render(
      <dialog open>
        <Menu label="Acciones" items={[{ id: 'a', label: 'Una', onSelect: vi.fn() }]}>
          {(trigger) => <button {...trigger}>Abrir</button>}
        </Menu>
      </dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.getByRole('menu').closest('dialog')).not.toBeNull()
  })
})

describe('Menu con filas de opción, buscador y nota', () => {
  const spaces: MenuItem[] = [
    { id: 'a', label: 'Acme Studio', description: 'Administrador', checked: true, searchable: true, onSelect: vi.fn() },
    { id: 'b', label: 'Clínica Sonrisa', description: 'Agente', checked: false, searchable: true, onSelect: vi.fn() },
    { id: 'c', label: 'Lumen Diseño', description: 'Agente', checked: false, searchable: true, onSelect: vi.fn() },
    { id: 'spaces', label: 'Tus espacios', separatorBefore: true, onSelect: vi.fn() },
  ]

  function renderSpaces(props: Partial<React.ComponentProps<typeof Menu>> = {}) {
    render(
      <Menu label="Cambiar de espacio" items={spaces} {...props}>
        {(trigger) => <button {...trigger}>Espacio</button>}
      </Menu>,
    )
    return screen.getByRole('button', { name: 'Espacio' })
  }

  it('las opciones son menuitemradio con la elegida marcada, y el menú se abre sobre ella', async () => {
    const trigger = renderSpaces()
    await userEvent.click(trigger)
    const rows = screen.getAllByRole('menuitemradio')
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(rows[0]).toHaveAccessibleName('Acme Studio, Administrador')
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tus espacios' })).toBeInTheDocument()
    await vi.waitFor(() => expect(rows[0]).toHaveFocus())
  })

  it('el separador no cuenta como elemento: las flechas lo saltan', async () => {
    const trigger = renderSpaces()
    trigger.focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Tus espacios' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitemradio', { name: /^Lumen/ })).toHaveFocus()
  })

  it('el buscador filtra solo los elementos `searchable`, sin acentos, y lo escrito no activa la búsqueda por letra', async () => {
    renderSpaces({ search: { label: 'Buscar espacio', emptyText: 'Nada coincide.' } })
    await userEvent.click(screen.getByRole('button', { name: 'Espacio' }))
    const search = screen.getByRole('searchbox', { name: 'Buscar espacio' })
    expect(screen.getByRole('menu')).not.toContainElement(search)
    await vi.waitFor(() => expect(search).toHaveFocus())
    await userEvent.keyboard('clinica')
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: 'Tus espacios' })).toBeInTheDocument()
    expect(search).toHaveValue('clinica')
    await userEvent.clear(search)
    await userEvent.keyboard('zzz')
    expect(screen.getByRole('status')).toHaveTextContent('Nada coincide.')
  })

  it('cerrar el menú con Escape borra la búsqueda: al volver a abrirlo está vacía', async () => {
    const trigger = renderSpaces({ search: { label: 'Buscar espacio', emptyText: 'Nada coincide.' } })
    await userEvent.click(trigger)
    await userEvent.keyboard('lumen')
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(trigger)
    expect(screen.getByRole('searchbox', { name: 'Buscar espacio' })).toHaveValue('')
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
  })

  it('la nota describe el menú, para que se oiga por qué un elemento está deshabilitado', async () => {
    const trigger = renderSpaces({ note: 'Es tu único espacio' })
    await userEvent.click(trigger)
    expect(screen.getByRole('menu')).toHaveAccessibleDescription('Es tu único espacio')
  })
})
