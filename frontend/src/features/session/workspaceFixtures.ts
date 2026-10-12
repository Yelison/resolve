import type { OrganizationRef } from '../../api/schema'

/** Dos espacios de la misma persona con el contrato nuevo: su rol en cada uno y cuántas personas activas hay. */
export const orgA: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000001',
  name: 'Acme Studio',
  role: 'admin',
  color: 'green',
  memberCount: 4,
}
export const orgB: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000002',
  name: 'Northwind',
  role: 'agent',
  color: 'magenta',
  memberCount: 6,
}
export const orgC: OrganizationRef = {
  id: '0192f000-0000-7000-8000-000000000003',
  name: 'Norte Viajes',
  role: 'customer',
  color: 'orange',
  memberCount: null,
}
