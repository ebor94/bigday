import { describe, expect, it } from 'vitest'
import { COLORES_NPS, TEXTO_NPS, contraste } from '../src/lib/colores-nps'

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

describe('contraste (WCAG 2.x)', () => {
  it('negro sobre blanco es 21:1 y un color consigo mismo 1:1', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contraste('#E8175D', '#E8175D')).toBeCloseTo(1, 5)
  })

  it('blanco sobre magenta ≈ 4,46:1 (valor conocido del proyecto)', () => {
    expect(contraste('#FFFFFF', '#E8175D')).toBeCloseTo(4.46, 1)
  })
})

describe('COLORES_NPS', () => {
  it('hay un color por cada número del 1 al 10', () => {
    expect(COLORES_NPS).toHaveLength(10)
  })

  it('el número (texto normal) cumple AA ≥ 4,5:1 sobre cada fondo', () => {
    for (const fondo of COLORES_NPS) expect(contraste(TEXTO_NPS, fondo), fondo).toBeGreaterThanOrEqual(4.5)
  })

  it('va de rojo (1) a ámbar (5) a verde (10)', () => {
    const [r1, g1] = rgb(COLORES_NPS[0]!)
    const [r5, g5, b5] = rgb(COLORES_NPS[4]!)
    const [r10, g10] = rgb(COLORES_NPS[9]!)
    expect(r1).toBeGreaterThan(g1 + 40)
    expect(r5).toBeGreaterThan(b5 + 60)
    expect(g5).toBeGreaterThan(b5 + 40)
    expect(g10).toBeGreaterThan(r10 + 30)
  })
})
