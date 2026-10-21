import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { buildHeader, computeSourceHash, parseEmbeddedHash, evaluarEstado } from '../sync/lib.mjs'

describe('computeSourceHash', () => {
  it('es el SHA-256 hexadecimal de los bytes crudos', () => {
    const bytes = Buffer.from('hola mundo\r\n', 'utf8')
    expect(computeSourceHash(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'))
  })

  it('cambia si cambia un solo byte', () => {
    expect(computeSourceHash(Buffer.from('a'))).not.toBe(computeSourceHash(Buffer.from('b')))
  })
})

describe('buildHeader / parseEmbeddedHash', () => {
  const hash = 'a'.repeat(64)

  it('la cabecera incluye el aviso en español y el hash en una línea parseable', () => {
    const header = buildHeader(hash)
    expect(header).toContain('GENERADO por npm run sync:backend desde bigDay/shared — NO EDITAR A MANO')
    expect(header).toContain(`// fuente-sha256: ${hash}`)
  })

  it('recupera el hash de un archivo generado', () => {
    expect(parseEmbeddedHash(buildHeader(hash) + '"use strict";\n')).toBe(hash)
  })

  it('devuelve null si no hay hash válido', () => {
    expect(parseEmbeddedHash('// nada\n')).toBeNull()
    expect(parseEmbeddedHash('// fuente-sha256: xyz\n')).toBeNull()
  })

  it('solo mira la cabecera, no el cuerpo del bundle', () => {
    const cuerpo = `var s = "// fuente-sha256: ${'b'.repeat(64)}";\n`
    expect(parseEmbeddedHash(buildHeader(hash) + cuerpo)).toBe(hash)
  })
})

describe('evaluarEstado', () => {
  const hash = 'c'.repeat(64)
  it('ausente si no hay contenido', () => {
    expect(evaluarEstado(null, hash).ok).toBe(false)
    expect(evaluarEstado(null, hash).mensaje).toMatch(/no existe/i)
  })
  it('desactualizado si el hash difiere', () => {
    const r = evaluarEstado(buildHeader('d'.repeat(64)), hash)
    expect(r.ok).toBe(false)
    expect(r.mensaje).toMatch(/desactualizado/i)
  })
  it('sin hash legible es fallo', () => {
    expect(evaluarEstado('sin cabecera', hash).ok).toBe(false)
  })
  it('ok si coincide', () => {
    expect(evaluarEstado(buildHeader(hash), hash).ok).toBe(true)
  })
})
