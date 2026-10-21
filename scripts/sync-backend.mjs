#!/usr/bin/env node
// Genera la copia CommonJS autocontenida de shared/src/survey.config.ts para el backend (ebor94/mantix, src/bigday).
// Uso: npm run sync:backend [-- --check]
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { buildHeader, computeSourceHash, evaluarEstado } from '../shared/sync/lib.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fuente = resolve(raiz, 'shared/src/survey.config.ts')
const mantix = resolve(raiz, process.env.MANTIX_DIR || '../mantix-git')
const destino = resolve(mantix, 'src/bigday/shared/survey.config.cjs')
const check = process.argv.includes('--check')

const hash = computeSourceHash(readFileSync(fuente))

if (check) {
  const estado = evaluarEstado(existsSync(destino) ? readFileSync(destino, 'utf8') : null, hash)
  console.log(`${estado.ok ? 'OK' : 'ERROR'}: ${estado.mensaje} (${destino})`)
  process.exit(estado.ok ? 0 : 1)
}

const resultado = await build({
  entryPoints: [fuente],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
})
const codigo = resultado.outputFiles[0].text

mkdirSync(dirname(destino), { recursive: true })
writeFileSync(destino, buildHeader(hash) + codigo)
console.log(`Generado ${destino} (fuente-sha256 ${hash})`)
