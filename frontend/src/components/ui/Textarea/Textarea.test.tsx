import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('admite escritura y error', async () => {
    render(<Textarea label="Descripción" error="Cuéntanos qué ocurre" />)
    const textarea = screen.getByRole('textbox', { name: 'Descripción' })
    await userEvent.type(textarea, 'No puedo entrar')
    expect(textarea).toHaveValue('No puedo entrar')
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
  })
})
