// Lógica pura de la sincronización shared -> backend de Mantix.
import { createHash } from 'node:crypto'

const MARCA = 'fuente-sha256:'
const RE_HASH = /^\/\/ fuente-sha256: ([0-9a-f]{64})\s*$/m

/** SHA-256 hexadecimal de los bytes crudos de la fuente. */
export function computeSourceHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Cabecera del archivo generado (aviso en español + hash parseable). */
export function buildHeader(hash) {
  return [
    '// GENERADO por npm run sync:backend desde bigDay/shared — NO EDITAR A MANO',
    `// ${MARCA} ${hash}`,
    '',
    '',
  ].join('\n')
}

/** Extrae el hash embebido; solo inspecciona las primeras líneas (la cabecera). */
export function parseEmbeddedHash(contenido) {
  const cabecera = contenido.split('\n').slice(0, 5).join('\n')
  const m = RE_HASH.exec(cabecera)
  return m ? m[1] : null
}

/** Compara el archivo generado (o null si no existe) con el hash actual de la fuente. */
export function evaluarEstado(contenido, hashFuente) {
  if (contenido === null) {
    return { ok: false, mensaje: 'El archivo generado no existe. Ejecuta: npm run sync:backend' }
  }
  const embebido = parseEmbeddedHash(contenido)
  if (embebido === null) {
    return { ok: false, mensaje: 'El archivo generado no tiene un hash de fuente legible. Ejecuta: npm run sync:backend' }
  }
  if (embebido !== hashFuente) {
    return { ok: false, mensaje: 'El archivo generado está desactualizado respecto a shared/src/survey.config.ts. Ejecuta: npm run sync:backend' }
  }
  return { ok: true, mensaje: 'El archivo generado está al día.' }
}
