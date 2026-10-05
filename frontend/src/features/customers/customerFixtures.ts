import type { CustomerDetail } from '../../domain/customer'

/** Cliente de prueba con el contrato de detalle; `overrides` cambia lo que cada test necesita. */
export const customerDetail = (overrides: Partial<CustomerDetail> = {}): CustomerDetail => ({
  id: 'c-maria',
  name: 'María Pérez',
  email: 'maria@cliente.example',
  company: 'Acme Studio',
  openTickets: 1,
  totalTickets: 4,
  createdAt: '2026-09-01T10:00:00Z',
  archived: false,
  notes: 'Prefiere que la llamen por la mañana.',
  archivedAt: null,
  version: 3,
  portalAccess: 'active',
  ...overrides,
})
