import { isApiError, PROBLEM_TYPES } from '../../api/client'

/** Quien el proveedor autenticó y aún no está en ningún espacio, como lo dice el `401` `no-membership`. */
export interface Newcomer {
  email: string
  name: string
  /** `canCreateOrganization`: la instalación le deja crear su primer espacio. */
  canCreate: boolean
}

/** Quien llegó sin espacio, o `undefined` si el error no es ese `401` o es de un servidor que no manda el correo. */
export function noMembershipNewcomer(error: unknown): Newcomer | undefined {
  if (!isApiError(error, 401) || error.problem.type !== PROBLEM_TYPES.noMembership) return undefined
  const { email, name, canCreateOrganization } = error.problem
  if (!email) return undefined
  return { email, name: name || email.split('@')[0]!, canCreate: canCreateOrganization === true }
}
