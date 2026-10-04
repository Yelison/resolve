import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'
import { initialsOf } from './initials'

describe('initialsOf', () => {
  it.each([
    ['Laura Méndez', 'LM'],
    ['María Pérez Gómez', 'MG'],
    ['yelisson', 'Y'],
    ['  Ana   Ruiz  ', 'AR'],
    ['', ''],
  ])('%j → %j', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })
})

describe('Avatar', () => {
  it('se anuncia con el nombre completo', () => {
    render(<Avatar name="Laura Méndez" />)
    expect(screen.getByRole('img', { name: 'Laura Méndez' })).toHaveTextContent('LM')
  })

  it('se oculta cuando es decorativo', () => {
    render(<Avatar name="Laura Méndez" decorative />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('Avatar con imagen', () => {
  it('vuelve a las iniciales si la imagen no carga', () => {
    const { container } = render(<Avatar name="Laura Méndez" src="/no-existe.png" />)
    const image = container.querySelector('img')
    expect(image).toBeInTheDocument()
    fireEvent.error(image!)
    expect(screen.getByRole('img', { name: 'Laura Méndez' })).toHaveTextContent('LM')
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })
})
