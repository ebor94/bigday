// Peso inicial (spec §10): suma gzip de todo JS + CSS en dist/assets; falla si supera 180 KB.
// No cuenta fuentes (Google Fonts, externas) ni la imagen hero/logo (no son JS ni CSS).
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(fileURLToPath(new URL('../dist/assets', import.meta.url)))
  const archivos = medirAssets(dir)
  if (archivos.length === 0) {
    console.error(`No hay JS/CSS en ${dir}. Ejecuta antes "npm run build".`)
    process.exit(1)
  }
  for (const a of archivos) console.log(`${a.archivo.padEnd(32)} ${(a.bytes / 1024).toFixed(1).padStart(7)} KB → ${(a.gzip / 1024).toFixed(1).padStart(6)} KB gzip`)
  const totalKb = archivos.reduce((s, a) => s + a.gzip, 0) / 1024
  const ok = totalKb <= LIMITE_KB
  console.log(`Total JS+CSS gzip: ${totalKb.toFixed(1)} KB (límite ${LIMITE_KB} KB) → ${ok ? 'OK' : 'EXCEDE'}`)
  process.exit(ok ? 0 : 1)
}
