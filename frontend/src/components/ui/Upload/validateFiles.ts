import { formatBytes } from '../../../lib/format'

export interface FileRules {
  /** Tipos MIME admitidos; vacío admite cualquiera. */
  accept: readonly string[]
  maxSize: number
}

export interface FileValidation {
  accepted: File[]
  errors: string[]
}

/** Separa los archivos válidos y describe por qué se rechaza cada uno de los demás. */
export function validateFiles(files: readonly File[], { accept, maxSize }: FileRules): FileValidation {
  const accepted: File[] = []
  const errors: string[] = []
  for (const file of files) {
    if (accept.length > 0 && !accept.includes(file.type)) {
      errors.push(`${file.name}: formato no admitido`)
    } else if (file.size > maxSize) {
      errors.push(`${file.name} supera el límite de ${formatBytes(maxSize)}`)
    } else {
      accepted.push(file)
    }
  }
  return { accepted, errors }
}
