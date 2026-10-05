/** Identificador ASCII para un encabezado: sin tildes, en minúsculas y con guiones. Nunca devuelve una cadena vacía. */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'seccion'
}
