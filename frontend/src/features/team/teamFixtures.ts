import type { TeamMember, TeamMetrics } from '../../domain/member'

/** Miembro de prueba con el contrato de lista; `overrides` cambia lo que cada test necesita. */
export const teamMember = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: 'u-laura',
  name: 'Laura Méndez',
  email: 'laura@acme.example',
  role: 'agent',
  status: 'active',
  openTickets: 3,
  joinedAt: '2026-08-01T10:00:00Z',
  invitedAt: null,
  ...overrides,
})

export const teamMetrics: TeamMetrics = {
  staff: 4,
  assignedOpen: 10,
  unassignedOpen: 1,
  averageLoad: 2.5,
  firstResponseMinutes: 18,
  firstResponseTargetMinutes: 30,
}
