import type { Me } from '../api/schema'

/**
 * Usuarios del selector de la demostración estática. Los correos son los de `features/session/demoUsers.ts` (el
 * selector guarda el elegido con ellos); el rol es el de la sesión simulada. No hay otra organización en la API
 * simulada, así que el agente de «otra organización» no se ofrece.
 */
export interface ShowcaseUser {
  email: string
  label: string
  role: Me['role']
}

export const showcaseUsers: ShowcaseUser[] = [
  { email: 'yelisson.ortiz@acme.example', label: 'Administración · ve y gestiona todo', role: 'admin' },
  { email: 'laura.mendez@acme.example', label: 'Agente · atiende tickets, sin administración', role: 'agent' },
  { email: 'maria.perez@cliente.example', label: 'Cliente · portal de una clienta', role: 'customer' },
]

/** Rol de la sesión simulada para el correo elegido; sin elección (o desconocido), la administración. */
export const roleFor = (email: string | null): Me['role'] =>
  showcaseUsers.find((user) => user.email === email)?.role ?? 'admin'
