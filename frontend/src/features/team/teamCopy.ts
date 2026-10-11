/** Textos con plural de la página de Equipo; `lib/format.ts` guarda los de uso común y estos son solo de esta pantalla. */

const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`)

/** «1 abierto», «8 abiertos»: la carga de una persona. */
export const openCount = (count: number) => plural(count, 'abierto', 'abiertos')

/** «1 urgente», «3 urgentes». */
export const urgentCount = (count: number) => plural(count, 'urgente', 'urgentes')

/** «1 ticket abierto», «96 tickets abiertos»: el total de la organización. */
export const openTicketsTotal = (count: number) => plural(count, 'ticket abierto', 'tickets abiertos')

/** «1 sin asignar», «27 sin asignar». */
export const unassignedCount = (count: number) => (count === 1 ? '1 sin asignar' : `${count} sin asignar`)

/** «1 persona», «22 personas». */
export const peopleCount = (count: number) => plural(count, 'persona', 'personas')

/** «1 miembro», «28 miembros». */
export const membersCount = (count: number) => plural(count, 'miembro', 'miembros')

/** «1 invitación», «6 invitaciones». */
export const invitationsCount = (count: number) => plural(count, 'invitación', 'invitaciones')
