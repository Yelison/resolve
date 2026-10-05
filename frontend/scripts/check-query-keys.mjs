// Rechaza un array literal como valor de `queryKey` fuera de las fábricas de claves (ticketKeys, customerKeys…).
// Las fábricas no usan la propiedad `queryKey`, así que cualquier array literal en ella es una clave suelta.
// Cubre comillas simples y dobles, varias líneas, spread, `as const`, `satisfies` y paréntesis.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

function unwrap(node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression
  }
  return node
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text
  return undefined
}

/** Devuelve `{ line, column }` (desde 1) de cada `queryKey` con array literal en `source`. */
export function findLooseQueryKeys(source, fileName = 'file.ts') {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const found = []
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name) === 'queryKey' &&
      ts.isArrayLiteralExpression(unwrap(node.initializer))
    ) {
      const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file))
      found.push({ line: line + 1, column: character + 1 })
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* sourceFiles(path)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) yield path
  }
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const problems = []
  for (const dir of ['src', 'e2e']) {
    let files
    try {
      files = [...sourceFiles(join(root, dir))]
    } catch {
      continue
    }
    for (const path of files) {
      for (const { line, column } of findLooseQueryKeys(readFileSync(path, 'utf8'), path)) {
        problems.push(`${relative(root, path)}:${line}:${column}`)
      }
    }
  }
  if (problems.length > 0) {
    console.error('Clave de consulta escrita como array literal fuera de las fábricas:')
    for (const p of problems) console.error(`  ${p}`)
    console.error('Usa una fábrica (ticketKeys, customerKeys, memberKeys, sessionKeys…) y añade la clave nueva allí.')
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
