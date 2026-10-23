// Datos de prueba realistas (~120 respuestas) con la forma exacta de GET /resultados
// (mantix-git/src/bigday/services/stats.js). Los usan las pruebas unitarias y las e2e (page.route).
// Las marginales de P2 y P3 coinciden con la matriz P2×P3 y el NPS con la distribución de P6.
import { QUESTIONS, labelFor } from '@bigday/shared'
import type { Resultados } from '../src/resultados/lib/tipos'

const CONTEOS: Record<'p1' | 'p2' | 'p3' | 'p4' | 'p5', Record<string, number>> = {
  p1: { A: 38, B: 47, C: 26, D: 9 },
  p2: { cementerio: 64, naturaleza: 18, ambas: 29, no_conocia: 9 },
  p3: { memoria: 11, parque_vida: 46, ambas: 52, sin_cambio: 8, otro: 3 },
  p4: { diversidad: 51, cientifico: 22, actividades: 28, relacion: 16, otro: 3 },
  p5: { A: 30, B: 41, C: 33, D: 16 },
}

/** Filas = P2, columnas = P3 (memoria, parque_vida, ambas, sin_cambio, otro). */
const MATRIZ: Record<string, number[]> = {
  cementerio: [7, 27, 24, 4, 2],
  naturaleza: [1, 7, 8, 2, 0],
  ambas: [3, 6, 17, 2, 1],
  no_conocia: [0, 6, 3, 0, 0],
}

/** P6 de 1 a 10: 14 detractores, 26 pasivos, 80 promotores → NPS +55. */
export const P6_PRUEBA = [2, 1, 1, 2, 3, 5, 9, 17, 31, 49]

export const FRASES_PRUEBA = [
  'Ven a ver aves increíbles en un lugar lleno de vida.',
  'Es un parque hermoso, se respira tranquilidad y naturaleza.',
  'Nunca imaginé ver tantas especies de aves en Cúcuta.',
  'Lleva a tus hijos: aprenden de ciencia y de arte al mismo tiempo.',
  'Me encantó <b>todo</b>, hasta los talleres de pintura.',
  'Un lugar de memoria que también celebra la vida.',
  'Los guías explican con mucho cariño y paciencia.',
  'Vale la pena madrugar para ver el mosquero bermellón.',
  'Es otra forma de conocer Los Olivos, muy recomendado.',
  'La biodiversidad que hay aquí es sorprendente.',
  'Ideal para ir en familia un fin de semana.',
  'Aprendí que el registro científico ayuda a conservar.',
  'Un plan diferente, tranquilo y educativo.',
  'Los niños quedaron felices con las actividades.',
  'Me sorprendió la cantidad de colibríes.',
  'Un espacio verde que todos deberíamos conocer.',
  'Excelente organización y gente muy amable.',
  'Volvería sin pensarlo para el próximo Big Day.',
  'Un parque de vida, literalmente.',
  'Gracias por abrir este espacio a la comunidad.',
]

function opcionesDe(id: string): string[] {
  const q = QUESTIONS.find((x) => x.id === id)
  return q && q.type === 'single' ? q.options.map((o) => o.code) : []
}

export function resultadosDePrueba(): Resultados {
  const distribucion = Object.fromEntries(
    (Object.keys(CONTEOS) as (keyof typeof CONTEOS)[]).map((id) => [
      id,
      opcionesDe(id).map((codigo) => ({ codigo, label: labelFor(id, codigo), total: CONTEOS[id][codigo] ?? 0 })),
    ]),
  ) as unknown as Resultados['distribucion']
  distribucion.p6 = P6_PRUEBA.map((total, i) => ({ valor: i + 1, total }))

  const p3 = opcionesDe('p3')
  const matrizP2P3 = opcionesDe('p2').flatMap((p2) =>
    p3.map((c3, j) => ({
      p2,
      p2Label: labelFor('p2', p2),
      p3: c3,
      p3Label: labelFor('p3', c3),
      total: MATRIZ[p2]?.[j] ?? 0,
    })),
  )

  // Más recientes primero, cada 37 minutos hacia atrás desde el domingo 18 a las 20:40 (Colombia).
  const inicio = Date.parse('2026-10-19T01:40:00.000Z')
  const ultimasFrases = FRASES_PRUEBA.map((texto, i) => ({
    texto,
    fecha: new Date(inicio - i * 37 * 60_000).toISOString(),
  }))

  return {
    total: 120,
    distribucion,
    nps: {
      total: 120,
      promotores: 80,
      pasivos: 26,
      detractores: 14,
      pctPromotores: 66.7,
      pctPasivos: 21.7,
      pctDetractores: 11.7,
      nps: 55,
    },
    matrizP2P3,
    ultimasFrases,
  }
}

/** Respuesta del backend sin ninguna respuesta guardada (estado vacío). */
export function resultadosVacios(): Resultados {
  const r = resultadosDePrueba()
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5'] as const) r.distribucion[id] = r.distribucion[id].map((o) => ({ ...o, total: 0 }))
  r.distribucion.p6 = r.distribucion.p6.map((o) => ({ ...o, total: 0 }))
  return {
    ...r,
    total: 0,
    nps: { total: 0, promotores: 0, pasivos: 0, detractores: 0, pctPromotores: null, pctPasivos: null, pctDetractores: null, nps: null },
    matrizP2P3: r.matrizP2P3.map((c) => ({ ...c, total: 0 })),
    ultimasFrases: [],
  }
}
