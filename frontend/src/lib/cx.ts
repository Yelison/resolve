type ClassValue = string | false | null | undefined

/** Une nombres de clase ignorando los valores vacíos. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
