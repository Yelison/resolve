import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Timeline } from './Timeline'

const sentAt = new Date('2026-10-04T10:24:00Z')

describe('Timeline', () => {
  it('lista los eventos en orden con su fecha', () => {
    render(
      <Timeline
        events={[
          { id: '1', kind: 'assignment', title: 'Laura tomó el ticket', at: sentAt, timeLabel: 'Hoy · 10:24' },
          { id: '2', kind: 'status', title: 'Estado: En progreso', at: sentAt, timeLabel: 'Hoy · 10:30' },
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Laura tomó el ticket')
    expect(items[1]).toHaveTextContent('Hoy · 10:30')
  })
})
