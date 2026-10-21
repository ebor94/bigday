import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QUESTIONS, respuestaSchema, labelFor } from '../src/survey.config'
import { computeSourceHash, parseEmbeddedHash } from '../sync/lib.mjs'

// Contrato con la copia generada en el backend de Mantix. Se omite si aún no existe.
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const mantix = resolve(raiz, process.env.MANTIX_DIR || '../mantix-git')
const generado = resolve(mantix, 'src/bigday/shared/survey.config.cjs')
const fuente = resolve(raiz, 'shared/src/survey.config.ts')

describe.skipIf(!existsSync(generado))('contrato con el backend de Mantix', () => {
  it('el hash embebido coincide con la fuente actual', () => {
    expect(parseEmbeddedHash(readFileSync(generado, 'utf8'))).toBe(computeSourceHash(readFileSync(fuente)))
  })

  it('exporta QUESTIONS, respuestaSchema y labelFor funcionales', () => {
    const copia = createRequire(import.meta.url)(generado)
    expect(copia.QUESTIONS).toEqual(QUESTIONS)
    expect(typeof copia.labelFor).toBe('function')

    const valida: Record<string, unknown> = { uuid: '123e4567-e89b-42d3-a456-426614174000', p6: 5, p7: 'Una experiencia muy bonita' }
    for (const q of QUESTIONS) if (q.type === 'single') valida[q.id] = q.options[0]!.code
    for (const entrada of [valida, {}, { p1: 'ZZ' }]) {
      expect(copia.respuestaSchema.safeParse(entrada).success).toBe(respuestaSchema.safeParse(entrada).success)
    }
    expect(respuestaSchema.safeParse(valida).success).toBe(true)
    expect(copia.respuestaSchema.safeParse({}).success).toBe(false)

    const q = QUESTIONS[0]!
    expect(copia.labelFor(q.id, q.options[0]!.code)).toBe(labelFor(q.id, q.options[0]!.code))
  })
})
