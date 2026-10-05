import type { Me } from '../../src/api/schema'
import { json, type MockFeature } from './shared'

export const me: Me = {
  user: { id: 'u-admin', name: 'Yelisson Ortiz', email: 'yelisson@acme.example' },
  organization: { id: 'org-1', name: 'Acme Studio', timeZone: 'America/Bogota', supportEmail: null },
  role: 'admin',
  customerId: null,
}

/** Sesión simulada: el administrador, o un cliente (`c-maria`) si `role` lo pide. */
export function sessionMock(role: Me['role']): MockFeature {
  const session: Me = role === 'customer' ? { ...me, role, customerId: 'c-maria' } : me
  return {
    handle: ({ route, path, method }) => (method === 'GET' && path === '/me' ? json(route, session) : undefined),
  }
}
