import { QUESTIONS, labelFor } from '@bigday/shared'
import { describe, expect, it } from 'vitest'
import { contraste } from '../src/lib/colores-nps'
import {
  COLORES_CALOR,
  COLORES_GRUPO_NPS,
  TEXTO_CALOR,
  destacadoPercepcion,
  formatoFecha,
  formatoNps,
  formatoPct,
  grupoNps,
  modeloDistribucion,
  modeloFrases,
  modeloMatriz,
  modeloNps,
  nivelCalor,
  porcentaje,
  porcentajesEnteros,
} from '../src/resultados/lib/modelo'
import type { CeldaMatriz } from '../src/resultados/lib/tipos'

const opciones = (id: string) => {
  const q = QUESTIONS.find((x) => x.id === id)
  if (!q || q.type !== 'single') throw new Error(id)
  return q.options
}

describe('porcentajesEnteros (resto mayor)', () => {
  it('suma exactamente 100 aunque el redondeo simple diera 99 o 101', () => {
    expect(porcentajesEnteros([1, 1, 1])).toEqual([34, 33, 33])
    expect(porcentajesEnteros([2, 2, 2, 1]).reduce((a, b) => a + b, 0)).toBe(100)
    expect(porcentajesEnteros([50, 30, 20])).toEqual([50, 30, 20])
  })

  it('total 0 → todo 0 (sin NaN ni división por cero)', () => {
    expect(porcentajesEnteros([0, 0, 0])).toEqual([0, 0, 0])
    expect(porcentajesEnteros([])).toEqual([])
  })

  it('con restos empatados gana el conteo menor (199 de 200 y 1 → 99 % y 1 %, no 100 % y 0 %); a igualdad, el primero', () => {
    expect(porcentajesEnteros([199, 1])).toEqual([99, 1])
    expect(porcentajesEnteros([1, 1])).toEqual([50, 50])
    expect(porcentajesEnteros([1, 1, 1])).toEqual([34, 33, 33])
  })

  it('ignora valores negativos o no numéricos (cuentan como 0)', () => {
    expect(porcentajesEnteros([-3, 4, Number.NaN])).toEqual([0, 100, 0])
  })
})

describe('porcentaje y formatos', () => {
  it('porcentaje con 1 decimal; null si el total es 0', () => {
    expect(porcentaje(1, 3)).toBe(33.3)
    expect(porcentaje(2, 3)).toBe(66.7)
    expect(porcentaje(5, 0)).toBeNull()
    expect(porcentaje(1, 8, 0)).toBe(13)
  })

  it('formatoPct usa coma decimal y espacio irrompible; null → "—"', () => {
    expect(formatoPct(33.3)).toBe('33,3\u00a0%')
    expect(formatoPct(50)).toBe('50\u00a0%')
    expect(formatoPct(null)).toBe('—')
  })

  it('formatoNps lleva signo; null → "—"', () => {
    expect(formatoNps(30)).toBe('+30')
    expect(formatoNps(-12)).toBe('−12')
    expect(formatoNps(0)).toBe('0')
    expect(formatoNps(null)).toBe('—')
  })

  it('formatoFecha en hora de Colombia; fecha inválida → ""', () => {
    expect(formatoFecha('2026-10-17T15:30:00.000Z')).toMatch(/17.*oct.*2026.*10:30/i)
    expect(formatoFecha('no-es-fecha')).toBe('')
  })
})

describe('modeloDistribucion', () => {
  it('sigue el orden y los textos literales de QUESTIONS (labelFor), no los del servidor', () => {
    const m = modeloDistribucion('p1', [
      { codigo: 'D', label: 'texto del servidor', total: 1 },
      { codigo: 'B', label: 'otro texto', total: 2 },
    ])
    expect(m.titulo).toBe(QUESTIONS[0].title)
    expect(m.total).toBe(3)
    expect(m.filas.map((f) => f.codigo)).toEqual(['A', 'B', 'C', 'D'])
    expect(m.filas.map((f) => f.etiqueta)).toEqual(opciones('p1').map((o) => o.label))
    expect(m.filas.map((f) => f.total)).toEqual([0, 2, 0, 1])
    expect(m.filas.map((f) => f.pct)).toEqual([0, 67, 0, 33])
    expect(m.filas[1]!.proporcion).toBeCloseTo(2 / 3)
  })

  it('códigos ausentes cuentan 0 y los desconocidos se añaden al final con su código', () => {
    const m = modeloDistribucion('p2', [{ codigo: 'raro', total: 4 }])
    expect(m.filas.map((f) => f.codigo)).toEqual([...opciones('p2').map((o) => o.code), 'raro'])
    expect(m.filas.at(-1)).toMatchObject({ etiqueta: 'raro', total: 4, pct: 100 })
  })

  it('sin datos o con total 0: filas en 0, proporción 0 y sin NaN', () => {
    for (const entradas of [undefined, [], opciones('p3').map((o) => ({ codigo: o.code, total: 0 }))]) {
      const m = modeloDistribucion('p3', entradas)
      expect(m.total).toBe(0)
      expect(m.filas).toHaveLength(opciones('p3').length)
      expect(m.filas.every((f) => f.total === 0 && f.pct === 0 && f.proporcion === 0)).toBe(true)
    }
  })

  it('totales inválidos del servidor (negativos, texto) cuentan 0', () => {
    const m = modeloDistribucion('p4', [
      { codigo: 'diversidad', total: -5 },
      { codigo: 'cientifico', total: 'x' as unknown as number },
      { codigo: 'relacion', total: 2 },
    ])
    expect(m.total).toBe(2)
    expect(m.filas.find((f) => f.codigo === 'relacion')!.pct).toBe(100)
  })
})

describe('grupoNps (spec §7: escala 1–10)', () => {
  it('1–6 detractor, 7–8 pasivo, 9–10 promotor', () => {
    expect([1, 6, 7, 8, 9, 10].map(grupoNps)).toEqual([
      'detractor', 'detractor', 'pasivo', 'pasivo', 'promotor', 'promotor',
    ])
  })
})

describe('modeloNps', () => {
  const p6 = (totales: number[]) => totales.map((total, i) => ({ valor: i + 1, total }))

  it('caso de la spec: 5 promotores, 3 pasivos, 2 detractores → NPS +30', () => {
    // valores: 1, 6 | 7, 7, 8 | 9, 9, 9, 10, 10
    const m = modeloNps(p6([1, 0, 0, 0, 0, 1, 2, 1, 3, 2]))
    expect(m.valor).toBe(30)
    expect(m.total).toBe(10)
    expect(m.grupos.map((g) => [g.grupo, g.total, g.pct])).toEqual([
      ['promotor', 5, 50],
      ['pasivo', 3, 30],
      ['detractor', 2, 20],
    ])
  })

  it('% de grupos con 1 decimal, como el servidor (80/26/14 de 120 → 66,7 / 21,7 / 11,7)', () => {
    const m = modeloNps(p6([2, 1, 1, 2, 3, 5, 9, 17, 31, 49]))
    expect(m.grupos.map((g) => g.pct)).toEqual([66.7, 21.7, 11.7])
    expect(m.valor).toBe(55)
  })

  it('redondea el NPS con aritmética entera como el servidor (−12,5 → −12; 12,5 → 13)', () => {
    // 1 promotor, 2 detractores, 5 pasivos de 8
    expect(modeloNps(p6([0, 0, 1, 1, 0, 0, 3, 2, 1, 0])).valor).toBe(-12)
    // 4 promotores, 1 detractor, 19 pasivos de 24
    expect(modeloNps(p6([0, 1, 0, 0, 0, 0, 0, 19, 0, 4])).valor).toBe(13)
  })

  it('las 10 barras van de 1 a 10 con su grupo, % y proporción respecto al máximo', () => {
    const m = modeloNps(p6([0, 0, 0, 0, 0, 0, 0, 0, 1, 3]))
    expect(m.barras.map((b) => b.valor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(m.barras[9]).toMatchObject({ total: 3, pct: 75, grupo: 'promotor', proporcion: 1 })
    expect(m.barras[8]!.proporcion).toBeCloseTo(1 / 3)
    expect(m.barras[0]).toMatchObject({ total: 0, pct: 0, grupo: 'detractor', proporcion: 0 })
  })

  it('sin respuestas: NPS null y nada en NaN; valores fuera de 1–10 se ignoran', () => {
    const vacio = modeloNps(undefined)
    expect(vacio.valor).toBeNull()
    expect(vacio.barras).toHaveLength(10)
    expect(vacio.grupos.every((g) => g.total === 0 && g.pct === 0)).toBe(true)
    const raro = modeloNps([{ valor: 0, total: 5 }, { valor: 11, total: 5 }, { valor: 10, total: 1 }])
    expect(raro.total).toBe(1)
    expect(raro.valor).toBe(100)
  })
})

describe('colores (contraste)', () => {
  it('cada nivel del mapa de calor tiene su texto con AA (≥ 4,5:1)', () => {
    COLORES_CALOR.forEach((fondo, nivel) => {
      expect(contraste(TEXTO_CALOR[nivel]!, fondo), `nivel ${nivel}`).toBeGreaterThanOrEqual(4.5)
    })
  })

  it('el mapa de calor va de claro a oscuro (secuencial, un solo tono)', () => {
    const lum = COLORES_CALOR.map((c) => contraste(c, '#000000'))
    for (let i = 1; i < lum.length; i++) expect(lum[i]!).toBeLessThan(lum[i - 1]!)
  })

  it('promotores y detractores (marcas) superan 3:1 sobre blanco; el gris neutro va con etiqueta', () => {
    expect(contraste(COLORES_GRUPO_NPS.promotor, '#FFFFFF')).toBeGreaterThanOrEqual(3)
    expect(contraste(COLORES_GRUPO_NPS.detractor, '#FFFFFF')).toBeGreaterThanOrEqual(3)
  })
})

describe('nivelCalor', () => {
  it('0 solo para celdas vacías; 1–5 proporcional al máximo', () => {
    expect(nivelCalor(0, 10)).toBe(0)
    expect(nivelCalor(1, 100)).toBe(1)
    expect(nivelCalor(10, 10)).toBe(5)
    expect(nivelCalor(5, 10)).toBe(3)
    expect(nivelCalor(3, 0)).toBe(0)
  })
})

/** Matriz completa en el orden del servidor, con los totales indicados por "p2|p3". */
function celdas(totales: Record<string, number>): CeldaMatriz[] {
  return opciones('p2').flatMap((o2) =>
    opciones('p3').map((o3) => ({
      p2: o2.code,
      p2Label: 'ignorado',
      p3: o3.code,
      p3Label: 'ignorado',
      total: totales[`${o2.code}|${o3.code}`] ?? 0,
    })),
  )
}

describe('modeloMatriz', () => {
  const m = modeloMatriz(
    celdas({ 'cementerio|parque_vida': 6, 'cementerio|memoria': 2, 'ambas|ambas': 4, 'no_conocia|otro': 1 }),
  )

  it('filas = opciones de P2 y columnas = opciones de P3, con textos literales de QUESTIONS', () => {
    expect(m.filas.map((f) => f.etiqueta)).toEqual(opciones('p2').map((o) => o.label))
    expect(m.columnas.map((c) => c.etiqueta)).toEqual(opciones('p3').map((o) => o.label))
    expect(m.columnas.map((c) => c.etiqueta)).toEqual(opciones('p3').map((o) => labelFor('p3', o.code)))
  })

  it('totales por fila, columna y general; % dentro de la fila', () => {
    expect(m.total).toBe(13)
    expect(m.maximo).toBe(6)
    const cem = m.filas.find((f) => f.codigo === 'cementerio')!
    expect(cem.total).toBe(8)
    expect(cem.celdas.map((c) => c.total)).toEqual([2, 6, 0, 0, 0])
    expect(cem.celdas.map((c) => c.pctFila)).toEqual([25, 75, 0, 0, 0])
    expect(cem.celdas[1]!.nivel).toBe(5)
    expect(m.columnas.find((c) => c.codigo === 'parque_vida')!.total).toBe(6)
    expect(m.filas.find((f) => f.codigo === 'naturaleza')!.celdas.every((c) => c.pctFila === 0)).toBe(true)
  })

  it('celdas faltantes cuentan 0 y las de códigos desconocidos se ignoran', () => {
    const r = modeloMatriz([
      { p2: 'cementerio', p2Label: '', p3: 'ambas', p3Label: '', total: 3 },
      { p2: 'xx', p2Label: '', p3: 'ambas', p3Label: '', total: 9 },
    ])
    expect(r.total).toBe(3)
    expect(r.filas).toHaveLength(4)
    expect(r.filas[0]!.celdas).toHaveLength(5)
  })

  it('sin datos: todo en 0', () => {
    const r = modeloMatriz(undefined)
    expect(r.total).toBe(0)
    expect(r.maximo).toBe(0)
    expect(r.filas.flatMap((f) => f.celdas).every((c) => c.nivel === 0 && c.pctFila === 0)).toBe(true)
  })
})

describe('destacadoPercepcion (indicador de marca, spec §1)', () => {
  it('% que ahora asocia Los Olivos con "Parque de Vida" o "ambas", en total y entre quienes lo veían como cementerio', () => {
    const d = destacadoPercepcion(
      modeloMatriz(
        celdas({
          'cementerio|parque_vida': 6, 'cementerio|ambas': 1, 'cementerio|memoria': 3,
          'ambas|ambas': 4, 'naturaleza|sin_cambio': 6,
        }),
      ),
    )
    expect(d.total).toBe(20)
    expect(d.nueva).toBe(11)
    expect(d.pct).toBe(55)
    expect(d.desdeCementerio).toEqual({ total: 10, nueva: 7, pct: 70 })
    expect(d.etiquetas).toEqual([labelFor('p3', 'parque_vida'), labelFor('p3', 'ambas')])
    expect(d.etiquetaAntes).toBe(labelFor('p2', 'cementerio'))
  })

  it('sin respuestas: porcentajes null', () => {
    const d = destacadoPercepcion(modeloMatriz([]))
    expect(d.pct).toBeNull()
    expect(d.desdeCementerio.pct).toBeNull()
  })
})

describe('modeloFrases', () => {
  it('conserva el orden, formatea la fecha y descarta entradas sin texto', () => {
    const f = modeloFrases([
      { texto: 'Hermoso lugar <b>lleno</b> de vida', fecha: '2026-10-17T15:30:00.000Z' },
      { texto: 42 as unknown as string, fecha: '2026-10-17T15:00:00.000Z' },
      { texto: 'Sin fecha válida', fecha: 'x' },
    ])
    expect(f.map((x) => x.texto)).toEqual(['Hermoso lugar <b>lleno</b> de vida', 'Sin fecha válida'])
    expect(f[0]!.fechaTexto).toMatch(/oct/i)
    expect(f[0]!.fechaIso).toBe('2026-10-17T15:30:00.000Z')
    expect(f[1]!.fechaTexto).toBe('')
    expect(modeloFrases(undefined)).toEqual([])
  })
})
