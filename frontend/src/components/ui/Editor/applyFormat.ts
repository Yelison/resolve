export type TextFormat = 'heading' | 'bold' | 'italic' | 'list' | 'link'

export interface TextEdit {
  value: string
  selectionStart: number
  selectionEnd: number
}

const wrappers: Record<'bold' | 'italic', string> = { bold: '**', italic: '_' }

/**
 * Aplica formato Markdown a la selección de un textarea y devuelve el texto y la nueva selección.
 * Sin selección inserta los marcadores y deja el cursor entre ellos.
 */
export function applyFormat(text: string, start: number, end: number, format: TextFormat): TextEdit {
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)

  if (format === 'bold' || format === 'italic') {
    const mark = wrappers[format]
    return {
      value: `${before}${mark}${selected}${mark}${after}`,
      selectionStart: start + mark.length,
      selectionEnd: end + mark.length,
    }
  }

  if (format === 'heading') {
    // Encabezado de nivel 2 en todas las líneas que toca la selección. Cualquier prefijo `#`…`######` pasa a `## `; si
    // todas ya lo son, se quita. La selección se desplaza lo que cambia cada línea hasta su inicio y su final.
    // Una selección que termina justo al inicio de una línea (p. ej. líneas completas con Mayús + ↓) no incluye esa línea.
    const touchedEnd = end > start && text[end - 1] === '\n' ? end - 1 : end
    const lineStart = before.lastIndexOf('\n') + 1
    const nextBreak = text.indexOf('\n', touchedEnd)
    const lineEnd = nextBreak === -1 ? text.length : nextBreak
    const lines = text.slice(lineStart, lineEnd).split('\n')
    const prefix = /^#{1,6} /
    // Las líneas vacías no se tocan: un `## ` sin texto no es un encabezado.
    const content = lines.filter((line) => line.trim() !== '')
    const allH2 = content.length > 0 && content.every((line) => line.startsWith('## '))
    const changed = lines.map((line) =>
      line.trim() === '' ? line : allH2 ? line.slice(3) : `## ${line.replace(prefix, '')}`,
    )
    // Cuánto cambia cada línea (más o menos caracteres), para recolocar el inicio y el final de la selección.
    const deltas = lines.map((line, index) => changed[index]!.length - line.length)
    const startLine = text.slice(lineStart, start).split('\n').length - 1
    const endLine = text.slice(lineStart, touchedEnd).split('\n').length - 1
    const sum = (upTo: number) => deltas.slice(0, upTo).reduce((total, delta) => total + delta, 0)
    return {
      value: `${text.slice(0, lineStart)}${changed.join('\n')}${text.slice(lineEnd)}`,
      selectionStart: Math.max(lineStart, start + sum(startLine + 1)),
      selectionEnd: Math.max(lineStart, end + sum(endLine + 1)),
    }
  }

  if (format === 'link') {
    const label = selected || 'texto'
    const value = `${before}[${label}](https://)${after}`
    // Deja seleccionada la URL para escribirla directamente.
    const urlStart = start + label.length + 3
    return { value, selectionStart: urlStart, selectionEnd: urlStart + 'https://'.length }
  }

  // Lista: antepone «- » a cada línea tocada por la selección.
  const lineStart = before.lastIndexOf('\n') + 1
  const block = text.slice(lineStart, end)
  const lines = block.split('\n')
  const listed = lines.map((line) => (line.startsWith('- ') ? line : `- ${line}`)).join('\n')
  const added = listed.length - block.length
  return {
    value: `${text.slice(0, lineStart)}${listed}${after}`,
    selectionStart: start + (lines[0]?.startsWith('- ') ? 0 : 2),
    selectionEnd: end + added,
  }
}
