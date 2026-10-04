import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Breadcrumb } from './Breadcrumb'

describe('Breadcrumb', () => {
  it('enlaza los niveles y marca la página actual', () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[{ label: 'Tickets', to: '/tickets' }, { label: '#1048' }]} />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    expect(nav).toContainElement(screen.getByRole('link', { name: 'Tickets' }))
    expect(screen.getByText('#1048')).toHaveAttribute('aria-current', 'page')
  })
})
