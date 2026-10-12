import type { Me } from '../api/schema'

/**
 * Usuarios del selector de la demostración estática. Los correos son los de `features/session/demoUsers.ts` (el
 * selector guarda el elegido con ellos); el rol es el de la sesión simulada. La administración tiene además dos
 * espacios más (`demoWorkspaces` de la API simulada); el agente de «otro espacio» no se ofrece. «Persona nueva» es la
 * cuenta sin espacio que siembra `V1009` en el backend (su correo es el de `NUEVA_PERSONA`): entra a «Crea tu espacio» y,
 * al crear el suyo, es su administradora.
 */
export interface ShowcaseUser {
  email: string
  label: string
  /** El rol de la sesión simulada; el de quien no tiene espacio es el que tendrá al crear el suyo. */
  role: Me['role']
  /** Entra sin pertenecer a ningún espacio: el `401` `no-membership` hasta que cree uno. */
  withoutWorkspace?: true
}

export const showcaseUsers: ShowcaseUser[] = [
  { email: 'yelisson.ortiz@acme.example', label: 'Administración', role: 'admin' },
  { email: 'laura.mendez@acme.example', label: 'Agente', role: 'agent' },
  { email: 'maria.perez@cliente.example', label: 'Cliente', role: 'customer' },
  { email: 'nueva.persona@demo.example', label: 'Persona nueva (sin espacio)', role: 'admin', withoutWorkspace: true },
]

/** Rol de la sesión simulada para el correo elegido; sin elección (o desconocido), la administración. */
export const roleFor = (email: string | null): Me['role'] =>
  showcaseUsers.find((user) => user.email === email)?.role ?? 'admin'

/** ¿El correo elegido es el de quien entra sin espacio? */
export const entersWithoutWorkspace = (email: string | null) =>
  showcaseUsers.some((user) => user.email === email && user.withoutWorkspace)
