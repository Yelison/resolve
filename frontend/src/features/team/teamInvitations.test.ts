import { describe, expect, it } from 'vitest'
import { pendingInvitations, sentLabel } from './teamInvitations'
import { teamMember } from './teamFixtures'

const now = new Date('2026-10-10T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

describe('sentLabel', () => {
  it('cuenta días enteros entre dos días y un mes', () => {
    expect(sentLabel(daysAgo(2), now)).toBe('Enviada hace 2 días')
    expect(sentLabel(daysAgo(5.5), now)).toBe('Enviada hace 5 días')
    expect(sentLabel(daysAgo(29), now)).toBe('Enviada hace 29 días')
  })

  it('usa el formato relativo para lo reciente y lo antiguo', () => {
    expect(sentLabel(daysAgo(1), now)).toBe('Enviada ayer')
    expect(sentLabel(new Date(now.getTime() - 3 * 3_600_000).toISOString(), now)).toBe('Enviada hace 3 horas')
    expect(sentLabel(daysAgo(60), now)).toBe('Enviada hace 2 meses')
  })

  it('sin fecha no inventa una', () => {
    expect(sentLabel(null, now)).toBeNull()
  })
})

describe('pendingInvitations', () => {
  it('deja solo las invitaciones, la más reciente primero y las que no traen fecha al final', () => {
    const members = [
      teamMember({ id: 'a', email: 'a@x.example', status: 'invited', invitedAt: daysAgo(5) }),
      teamMember({ id: 'b', email: 'b@x.example', status: 'invited', invitedAt: daysAgo(1) }),
      teamMember({ id: 'c', email: 'c@x.example', status: 'invited', invitedAt: null }),
      teamMember({ id: 'd', status: 'active' }),
      teamMember({ id: 'e', status: 'removed' }),
    ]
    expect(pendingInvitations(members).map((member) => member.id)).toEqual(['b', 'a', 'c'])
  })
})
