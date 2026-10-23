// Datos de la API → modelos listos para pintar (funciones puras, sin Vue).
// Orden, enunciados y textos de opciones salen SIEMPRE de @bigday/shared (QUESTIONS + labelFor);
// del servidor solo se toman códigos y conteos.
import { QUESTIONS, labelFor } from '@bigday/shared'
import type { CeldaMatriz, ConteoOpcion, ConteoValor, Frase } from './tipos'

type Pregunta = (typeof QUESTIONS)[number]
type PreguntaOpcion = Extract<Pregunta, { type: 'single' }>
export type IdOpcion = PreguntaOpcion['id']
type CodigoDe<I extends IdOpcion> = Extract<PreguntaOpcion, { id: I }>['options'][number]['code']

const NBSP = '\u00a0'

function preguntaOpcion<I extends IdOpcion>(id: I): Extract<PreguntaOpcion, { id: I }> {
  return QUESTIONS.find((q) => q.id === id) as Extract<PreguntaOpcion, { id: I }>
}

const P6 = QUESTIONS.find((q) => q.id === 'p6') as Extract<Pregunta, { id: 'p6' }>

/** Conteo saneado: entero ≥ 0 (un valor raro del servidor cuenta 0, nunca NaN). */
const conteo = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

const sumar = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * Porcentajes enteros que suman exactamente 100 (método del resto mayor): primero se trunca y
 * luego se reparten los puntos que faltan a los mayores restos. Empate de restos → el conteo menor (así
 * 199 y 1 dan 99 % y 1 %, no 100 % y 0 %); a igualdad de conteo, el primero. Total 0 → todo 0.
 */
export function porcentajesEnteros(conteos: readonly number[]): number[] {
  const limpios = conteos.map(conteo)
  const total = sumar(limpios)
  if (total === 0) return limpios.map(() => 0)
  const exactos = limpios.map((n) => (n * 100) / total)
  const base = exactos.map(Math.floor)
  let faltan = 100 - sumar(base)
  const orden = exactos
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto || limpios[a.i]! - limpios[b.i]! || a.i - b.i)
  for (const { i } of orden) {
    if (faltan <= 0) break
    base[i]! += 1
    faltan -= 1
  }
  return base
}

/** n / total en %, redondeado a `decimales`; null si no hay total (no se divide por cero). */
export function porcentaje(n: number, total: number, decimales = 1): number | null {
  if (!(total > 0)) return null
  const f = 10 ** decimales
  return Math.round(((conteo(n) * 100) / total) * f) / f
}

const numeroEs = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** "33,3 %" (coma decimal y espacio irrompible, norma del español); null → "—". */
export function formatoPct(x: number | null): string {
  return x === null ? '—' : `${numeroEs.format(x)}${NBSP}%`
}

/** NPS con signo: "+30", "−12" (signo menos tipográfico), "0"; null → "—". */
export function formatoNps(x: number | null): string {
  if (x === null) return '—'
  if (x > 0) return `+${x}`
  if (x < 0) return `−${Math.abs(x)}`
  return '0'
}

const fechaEs = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Bogota',
})

/** Fecha y hora en hora de Colombia ("17 oct 2026, 10:30"); fecha inválida → "". */
export function formatoFecha(fecha: string | Date): string {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  return Number.isNaN(d.getTime()) ? '' : fechaEs.format(d)
}

// ── Distribución P1–P5 ──

export interface FilaBarra {
  codigo: string
  etiqueta: string
  total: number
  /** % entero del total de la pregunta (las filas suman 100). */
  pct: number
  /** total / total de la pregunta, de 0 a 1 (largo de la barra). */
  proporcion: number
}

export interface ModeloDistribucion {
  id: IdOpcion
  titulo: string
  total: number
  filas: FilaBarra[]
}

export function modeloDistribucion(id: IdOpcion, entradas: readonly ConteoOpcion[] | undefined): ModeloDistribucion {
  const pregunta = preguntaOpcion(id)
  const recibidos = new Map<string, number>()
  for (const e of entradas ?? []) {
    if (e && typeof e.codigo === 'string') recibidos.set(e.codigo, (recibidos.get(e.codigo) ?? 0) + conteo(e.total))
  }
  const conocidos: string[] = pregunta.options.map((o) => o.code)
  // Códigos que el servidor conoce y este front no (versiones desfasadas): se muestran al final con su código.
  const codigos = [...conocidos, ...[...recibidos.keys()].filter((c) => !conocidos.includes(c))]
  const totales = codigos.map((c) => recibidos.get(c) ?? 0)
  const total = sumar(totales)
  const pcts = porcentajesEnteros(totales)
  return {
    id,
    titulo: pregunta.title,
    total,
    filas: codigos.map((codigo, i) => ({
      codigo,
      etiqueta: labelFor(id, codigo),
      total: totales[i]!,
      pct: pcts[i]!,
      proporcion: total > 0 ? totales[i]! / total : 0,
    })),
  }
}

// ── NPS (P6) ──

export type GrupoNps = 'promotor' | 'pasivo' | 'detractor'

/** Escala 1–10 (spec §7): promotores 9–10, pasivos 7–8, detractores 1–6. */
export const MIN_PROMOTOR = 9
export const MIN_PASIVO = 7

export function grupoNps(valor: number): GrupoNps {
  if (valor >= MIN_PROMOTOR) return 'promotor'
  if (valor >= MIN_PASIVO) return 'pasivo'
  return 'detractor'
}

export const ETIQUETA_GRUPO: Record<GrupoNps, string> = {
  promotor: 'Promotores (9–10)',
  pasivo: 'Pasivos (7–8)',
  detractor: 'Detractores (1–6)',
}

/** Para la tabla de P6, donde el valor ya dice el rango. */
export const ETIQUETA_GRUPO_CORTA: Record<GrupoNps, string> = {
  promotor: 'Promotor',
  pasivo: 'Pasivo',
  detractor: 'Detractor',
}

/**
 * Colores del NPS: divergente (dos polos + gris neutro en el medio). Validados con el validador de la
 * skill dataviz sobre blanco: CVD adyacente ΔE ≥ 10,6, visión normal ≥ 16,2. El gris queda < 3:1 a
 * propósito (punto medio neutro): siempre va con leyenda, etiqueta y tabla.
 */
export const COLORES_GRUPO_NPS: Record<GrupoNps, string> = {
  detractor: '#F0461E', // --c-vermilion
  pasivo: '#8E9A9E',
  promotor: '#0E8A5F', // --c-green
}

export interface BarraNps {
  valor: number
  total: number
  pct: number
  grupo: GrupoNps
  /** Respecto a la barra más alta (0–1). */
  proporcion: number
}

export interface ModeloNps {
  /** −100…100, entero; null sin respuestas. */
  valor: number | null
  total: number
  grupos: { grupo: GrupoNps; etiqueta: string; total: number; pct: number }[]
  barras: BarraNps[]
}

export function modeloNps(p6: readonly ConteoValor[] | undefined): ModeloNps {
  const porValor = new Map<number, number>()
  for (let v = P6.min; v <= P6.max; v++) porValor.set(v, 0)
  for (const e of p6 ?? []) {
    if (e && porValor.has(e.valor)) porValor.set(e.valor, porValor.get(e.valor)! + conteo(e.total))
  }
  const valores = [...porValor.keys()]
  const totales = [...porValor.values()]
  const total = sumar(totales)
  const maximo = Math.max(0, ...totales)
  const orden: GrupoNps[] = ['promotor', 'pasivo', 'detractor']
  const porGrupo = orden.map((g) => sumar(valores.filter((v) => grupoNps(v) === g).map((v) => porValor.get(v)!)))
  const [promotores, , detractores] = porGrupo as [number, number, number]
  return {
    // Igual que el servidor: aritmética entera, (P − D) × 100 / total, sin pasar por los porcentajes.
    valor: total > 0 ? Math.round(((promotores - detractores) * 100) / total) : null,
    total,
    // Grupos con 1 decimal, como el servidor (66,7 / 21,7 / 11,7): con enteros, el reparto del resto
    // tendría que redondear mal alguno de los tres.
    grupos: orden.map((grupo, i) => ({
      grupo,
      etiqueta: ETIQUETA_GRUPO[grupo],
      total: porGrupo[i]!,
      pct: porcentaje(porGrupo[i]!, total) ?? 0,
    })),
    barras: valores.map((valor, i) => ({
      valor,
      total: totales[i]!,
      // 1 decimal, coherente con los % de los grupos (66,7 %).
      pct: porcentaje(totales[i]!, total) ?? 0,
      grupo: grupoNps(valor),
      proporcion: maximo > 0 ? totales[i]! / maximo : 0,
    })),
  }
}

// ── Matriz P2 × P3 ──

/**
 * Mapa de calor secuencial (un solo tono, claro → oscuro) derivado de --c-teal-900. Nivel 0 = celda vacía.
 * TEXTO_CALOR elige tinta o blanco para que cada número cumpla AA (≥ 4,5:1; ver pruebas).
 */
export const COLORES_CALOR = ['#F4F8FA', '#D1DEE3', '#B5C8CE', '#7E9CA6', '#49727F', '#0D4A5A'] as const
export const TEXTO_CALOR = ['#1E2A2E', '#1E2A2E', '#1E2A2E', '#1E2A2E', '#FFFFFF', '#FFFFFF'] as const
export type NivelCalor = 0 | 1 | 2 | 3 | 4 | 5

/** 0 solo si la celda está vacía; si no, 1–5 según n / máximo (en quintos). */
export function nivelCalor(n: number, maximo: number): NivelCalor {
  if (!(n > 0) || !(maximo > 0)) return 0
  return Math.min(5, Math.max(1, Math.ceil((n / maximo) * 5))) as NivelCalor
}

export interface CeldaModelo {
  codigo: string
  etiqueta: string
  total: number
  /** % entero dentro de su fila (P2). */
  pctFila: number
  nivel: NivelCalor
}

export interface FilaMatriz {
  codigo: string
  etiqueta: string
  total: number
  celdas: CeldaModelo[]
}

export interface ModeloMatriz {
  filas: FilaMatriz[]
  columnas: { codigo: string; etiqueta: string; total: number }[]
  total: number
  maximo: number
}

export function modeloMatriz(celdas: readonly CeldaMatriz[] | undefined): ModeloMatriz {
  const p2 = preguntaOpcion('p2').options.map((o) => o.code as string)
  const p3 = preguntaOpcion('p3').options.map((o) => o.code as string)
  const cuenta = new Map<string, number>()
  for (const c of celdas ?? []) {
    if (!c || !p2.includes(c.p2) || !p3.includes(c.p3)) continue
    const clave = `${c.p2}|${c.p3}`
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + conteo(c.total))
  }
  const valor = (a: string, b: string) => cuenta.get(`${a}|${b}`) ?? 0
  const maximo = Math.max(0, ...cuenta.values())
  const filas = p2.map((a) => {
    const totales = p3.map((b) => valor(a, b))
    const pcts = porcentajesEnteros(totales)
    return {
      codigo: a,
      etiqueta: labelFor('p2', a),
      total: sumar(totales),
      celdas: p3.map((b, j) => ({
        codigo: b,
        etiqueta: labelFor('p3', b),
        total: totales[j]!,
        pctFila: pcts[j]!,
        nivel: nivelCalor(totales[j]!, maximo),
      })),
    }
  })
  return {
    filas,
    columnas: p3.map((b) => ({ codigo: b, etiqueta: labelFor('p3', b), total: sumar(p2.map((a) => valor(a, b))) })),
    total: sumar(filas.map((f) => f.total)),
    maximo,
  }
}

export interface ModeloMatrizCompacta {
  /** Solo filas con respuestas y, dentro de ellas, solo celdas con respuestas (orden de QUESTIONS). */
  filas: FilaMatriz[]
  /** Totales de cada opción de P3 (todas) con % entero del total general. */
  columnas: { codigo: string; etiqueta: string; total: number; pct: number }[]
  total: number
  /** true si se quitó alguna celda o fila vacía (para avisarlo). */
  ocultas: boolean
}

/** Versión compacta de la matriz para pantallas estrechas: sin combinaciones vacías, con resumen de P3. */
export function modeloMatrizCompacta(m: ModeloMatriz): ModeloMatrizCompacta {
  const filas = m.filas
    .filter((f) => f.total > 0)
    .map((f) => ({ ...f, celdas: f.celdas.filter((c) => c.total > 0) }))
  const pcts = porcentajesEnteros(m.columnas.map((c) => c.total))
  const celdasTotales = m.filas.reduce((n, f) => n + f.celdas.length, 0)
  const celdasVisibles = filas.reduce((n, f) => n + f.celdas.length, 0)
  return {
    filas,
    columnas: m.columnas.map((c, i) => ({ ...c, pct: pcts[i]! })),
    total: m.total,
    ocultas: celdasVisibles < celdasTotales,
  }
}

/** Respuestas de P3 que cuentan como "nueva percepción" de marca (spec §1: "Parque de Vida"). */
export const P3_NUEVA_PERCEPCION = ['parque_vida', 'ambas'] as const satisfies readonly CodigoDe<'p3'>[]
/** Percepción de partida que la marca quiere cambiar. */
export const P2_ANTES_CEMENTERIO = 'cementerio' satisfies CodigoDe<'p2'>

export interface DestacadoPercepcion {
  total: number
  nueva: number
  pct: number | null
  desdeCementerio: { total: number; nueva: number; pct: number | null }
  /** Textos literales de las opciones de P3 que cuentan. */
  etiquetas: string[]
  etiquetaAntes: string
}

/** Indicador clave de marca, calculado en el cliente a partir de la matriz P2 × P3. */
export function destacadoPercepcion(m: ModeloMatriz): DestacadoPercepcion {
  const esNueva = (codigo: string) => (P3_NUEVA_PERCEPCION as readonly string[]).includes(codigo)
  const nuevaEn = (f: FilaMatriz) => sumar(f.celdas.filter((c) => esNueva(c.codigo)).map((c) => c.total))
  const nueva = sumar(m.filas.map(nuevaEn))
  const cem = m.filas.find((f) => f.codigo === P2_ANTES_CEMENTERIO)
  const nuevaCem = cem ? nuevaEn(cem) : 0
  const totalCem = cem?.total ?? 0
  return {
    total: m.total,
    nueva,
    pct: porcentaje(nueva, m.total, 0),
    desdeCementerio: { total: totalCem, nueva: nuevaCem, pct: porcentaje(nuevaCem, totalCem, 0) },
    etiquetas: P3_NUEVA_PERCEPCION.map((c) => labelFor('p3', c)),
    etiquetaAntes: labelFor('p2', P2_ANTES_CEMENTERIO),
  }
}

// ── Frases (P7) ──

export interface FraseModelo {
  texto: string
  fechaIso: string
  fechaTexto: string
}

/** Frases tal cual (se pintan con interpolación de texto de Vue, nunca como HTML). */
export function modeloFrases(frases: readonly Frase[] | undefined): FraseModelo[] {
  return (frases ?? [])
    .filter((f) => f && typeof f.texto === 'string' && f.texto.trim() !== '')
    .map((f) => {
      const fechaTexto = typeof f.fecha === 'string' ? formatoFecha(f.fecha) : ''
      return { texto: f.texto, fechaIso: fechaTexto ? f.fecha : '', fechaTexto }
    })
}
