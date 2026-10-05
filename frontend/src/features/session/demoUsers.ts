/** Usuarios sembrados del perfil `dev` (los mismos correos que el realm de Keycloak y la documentación). */
export interface DemoUser {
  email: string
  label: string
}

export const demoUsers: DemoUser[] = [
  { email: 'yelisson.ortiz@acme.example', label: 'Yelisson Ortiz · administrador' },
  { email: 'laura.mendez@acme.example', label: 'Laura Méndez · agente' },
  { email: 'maria.perez@cliente.example', label: 'María Pérez · cliente' },
  { email: 'jordi.puig@northwind.example', label: 'Jordi Puig · agente de otra organización' },
]
