// Peso inicial (spec §10) POR ENTRADA HTML: suma gzip de los JS + CSS que cada HTML de dist carga de
// entrada (<script src>, <link rel="modulepreload">, <link rel="stylesheet"> bajo /assets/); falla si alguna
// entrada supera 180 KB. Así la vista de resultados (resultados.html, chunk propio) no cuenta en el peso de
// la encuesta (index.html) y viceversa. Los chunks que comparten ambas cuentan en las dos.
// No cuenta fuentes (Google Fonts, externas) ni imágenes (no son JS ni CSS).
// Uso: npm run build && npm run peso
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

export const LIMITE_KB = 180

/** Tamaños gzip (bytes) de cada .js/.css de `dir`. */
export function medirAssets(dir) {
  return readdirSync(dir)
    .filter((f) => ['.js', '.css'].includes(extname(f)))
    .map((f) => {
      const crudo = readFileSync(join(dir, f))
      return { archivo: f, bytes: crudo.length, gzip: gzipSync(crudo, { level: 9 }).length }
    })
}

/** Nombres (sin ruta) de los .js/.css de assets/ que un HTML carga de entrada, en orden y sin repetir. */
export function assetsIniciales(html) {
  const etiquetas = html.match(/<(script|link)\b[^>]*>/gi) ?? []
  const nombres = []
  for (const etiqueta of etiquetas) {
    const esScript = /^<script/i.test(etiqueta)
    const rel = /\brel=["']?([^"'\s>]+)/i.exec(etiqueta)?.[1]?.toLowerCase()
    if (!esScript && rel !== 'modulepreload' && rel !== 'stylesheet') continue
    const ruta = (esScript ? /\bsrc=["']([^"']+)/i : /\bhref=["']([^"']+)/i).exec(etiqueta)?.[1]
    const m = ruta && /(?:^|\/)assets\/([^/?#]+\.(?:js|css))(?:[?#]|$)/.exec(ruta)
    if (m && !nombres.includes(m[1])) nombres.push(m[1])
  }
  return nombres
}

const kb = (b) => (b / 1024).toFixed(1)

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
  const dir = join(dist, 'assets')
  let archivos = []
  try {
    archivos = medirAssets(dir)
  } catch {
    // sin dist/assets
  }
  if (archivos.length === 0) {
    console.error(`No hay JS/CSS en ${dir}. Ejecuta antes "npm run build".`)
    process.exit(1)
  }
  const porNombre = new Map(archivos.map((a) => [a.archivo, a]))
  const entradas = readdirSync(dist).filter((f) => f.endsWith('.html')).sort()
  let ok = true
  for (const html of entradas) {
    const nombres = assetsIniciales(readFileSync(join(dist, html), 'utf8'))
    console.log(`\n${html}`)
    let total = 0
    for (const n of nombres) {
      const a = porNombre.get(n)
      if (!a) {
        console.error(`  falta assets/${n}`)
        ok = false
        continue
      }
      total += a.gzip
      console.log(`  ${n.padEnd(34)} ${kb(a.bytes).padStart(7)} KB → ${kb(a.gzip).padStart(6)} KB gzip`)
    }
    const dentro = total / 1024 <= LIMITE_KB
    ok &&= dentro
    console.log(`  Peso inicial JS+CSS gzip: ${kb(total)} KB (límite ${LIMITE_KB} KB) → ${dentro ? 'OK' : 'EXCEDE'}`)
  }
  const todo = archivos.reduce((s, a) => s + a.gzip, 0)
  console.log(`\nTodos los assets JS+CSS (informativo): ${kb(todo)} KB gzip en ${archivos.length} archivos`)
  process.exit(ok ? 0 : 1)
}
