import { computed, reactive, ref } from 'vue'
import { OTRO_MAX, QUESTIONS, respuestaSchema, type Respuesta } from '@bigday/shared'

// Estado de UNA corrida de la encuesta (sin UI): navegación, validación, uuid, cronómetro
// y armado del payload. Las reglas salen de `shared` (QUESTIONS / respuestaSchema); aquí no
// se duplican límites ni opciones. El avance automático a los 600 ms es cosa de la UI.

export type IdPregunta = (typeof QUESTIONS)[number]['id']
export type Paso = 'bienvenida' | IdPregunta | 'gracias'

/** Borrador de respuestas: solo códigos (y números/textos libres), nunca etiquetas. */
export type Borrador = Partial<Record<IdPregunta | 'p3_otro' | 'p4_otro', string | number>>

export type ResultadoConstruccion = { ok: true; datos: Respuesta } | { ok: false; errores: string[] }

export interface OpcionesSurvey {
  /** Reloj en ms (inyectable para pruebas). */
  ahora?: () => number
  /** Query string a leer para `?src=` (por defecto `window.location.search`). */
  search?: string
}

const IDS = QUESTIONS.map((q) => q.id)
const PASOS: readonly Paso[] = ['bienvenida', ...IDS, 'gracias']

/** UUID v4: `crypto.randomUUID` si existe; si no (iOS 15.0–15.3) RFC 4122 con `getRandomValues`. */
export function generarUuid(): string {
  const c: Crypto | undefined = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes)
  } else {
    // Último recurso: solo es una clave de idempotencia, no un secreto.
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return [hex.slice(0, 4), hex.slice(4, 6), hex.slice(6, 8), hex.slice(8, 10), hex.slice(10, 16)]
    .map((g) => g.join(''))
    .join('-')
}

/** `?src=` → solo `[a-z0-9_-]`, minúsculas, máx. 40; si no cumple, `undefined`. */
export function leerOrigen(search: string): string | undefined {
  let valor: string | null
  try {
    valor = new URLSearchParams(search).get('src')
  } catch {
    return undefined
  }
  if (!valor) return undefined
  const limpio = valor.toLowerCase()
  return /^[a-z0-9_-]{1,40}$/.test(limpio) ? limpio : undefined
}

type Esquema = { safeParse(v: unknown): { success: boolean } }
const esquemaDe = (id: IdPregunta): Esquema => respuestaSchema.shape[id]
const esquemaOtro = (id: 'p3' | 'p4'): Esquema => respuestaSchema.shape[`${id}_otro`]

/** Mensaje de error de la pregunta, o `null` si está bien respondida. */
function validarPregunta(id: IdPregunta, r: Borrador): string | null {
  const q = QUESTIONS.find((x) => x.id === id)!
  const valor = r[id]
  if (q.type === 'scale') {
    const msg = `Elige un número del ${q.min} al ${q.max}.`
    return typeof valor === 'number' && esquemaDe(id).safeParse(valor).success ? null : msg
  }
  if (q.type === 'open') {
    const msg = `Escribe entre ${q.minLength} y ${q.maxLength} caracteres.`
    return typeof valor === 'string' && esquemaDe(id).safeParse(valor).success ? null : msg
  }
  if (typeof valor !== 'string' || valor === '') return 'Elige una opción para continuar.'
  if (!esquemaDe(id).safeParse(valor).success) return 'Elige una opción válida.'
  if (q.allowOther && valor === 'otro') {
    const campo = `${id as 'p3' | 'p4'}_otro` as const
    const raw = r[campo]
    const texto = (typeof raw === 'string' ? raw : '').trim()
    if (texto === '') return 'Escribe tu respuesta en "Otro".'
    if (!esquemaOtro(id as 'p3' | 'p4').safeParse(texto).success) return `Máximo ${OTRO_MAX} caracteres.`
  }
  return null
}

export function useSurvey(opciones: OpcionesSurvey = {}) {
  const ahora = opciones.ahora ?? (() => Date.now())
  const search = opciones.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const origen = leerOrigen(search)

  const paso = ref<Paso>('bienvenida')
  const respuestas = reactive<Borrador>({})
  const error = ref<string | null>(null)
  const uuid = ref<string | null>(null)
  let inicio: number | null = null

  const indicePaso = computed(() => PASOS.indexOf(paso.value))

  const progreso = computed(() => {
    const total = IDS.length
    const indice = paso.value === 'gracias' ? total : Math.max(0, indicePaso.value)
    return { indice, total }
  })

  const esPregunta = (p: Paso): p is IdPregunta => (IDS as readonly string[]).includes(p)

  const puedeAvanzar = computed(() => esPregunta(paso.value) && validarPregunta(paso.value, respuestas) === null)

  /** Inicia la corrida: cronómetro y uuid UNA sola vez (llamadas repetidas no los reinician). */
  function comenzar() {
    if (uuid.value === null) uuid.value = generarUuid()
    if (inicio === null) inicio = ahora()
    if (paso.value === 'bienvenida') paso.value = IDS[0]!
  }

  function responder(id: IdPregunta, valor: string | number) {
    respuestas[id] = valor
    if ((id === 'p3' || id === 'p4') && valor !== 'otro') {
      // El esquema rechaza `*_otro` si la respuesta no es "otro".
      delete respuestas[`${id}_otro`]
    }
    error.value = null
  }

  function responderOtro(id: 'p3' | 'p4', texto: string) {
    respuestas[`${id}_otro`] = texto
    error.value = null
  }

  /** Valida la pregunta actual y avanza. Desde p7 pasa a 'gracias' (el envío lo orquesta la UI). */
  function siguiente(): boolean {
    const actual = paso.value
    if (!esPregunta(actual)) return false
    const msg = validarPregunta(actual, respuestas)
    if (msg !== null) {
      error.value = msg
      return false
    }
    error.value = null
    paso.value = PASOS[indicePaso.value + 1]!
    return true
  }

  function atras() {
    const actual = paso.value
    if (!esPregunta(actual)) return
    error.value = null
    paso.value = PASOS[indicePaso.value - 1]!
  }

  function duracionSeg(): number {
    if (inicio === null) return 0
    return Math.max(0, Math.floor((ahora() - inicio) / 1000))
  }

  function construirRespuesta(): ResultadoConstruccion {
    const candidato: Record<string, unknown> = {
      uuid: uuid.value ?? '',
      p1: respuestas.p1,
      p2: respuestas.p2,
      p3: respuestas.p3,
      p4: respuestas.p4,
      p5: respuestas.p5,
      p6: respuestas.p6,
      p7: respuestas.p7,
      duracion_seg: duracionSeg(),
      website: '',
    }
    for (const campo of ['p3', 'p4'] as const) {
      const texto = respuestas[`${campo}_otro`]
      if (respuestas[campo] === 'otro' && typeof texto === 'string') candidato[`${campo}_otro`] = texto
    }
    if (origen !== undefined) candidato.origen = origen
    const r = respuestaSchema.safeParse(candidato)
    if (r.success) return { ok: true, datos: r.data }
    return { ok: false, errores: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  }

  /** Nueva corrida: respuestas vacías; el próximo `comenzar()` crea otro uuid y cronómetro. */
  function reiniciar() {
    for (const clave of Object.keys(respuestas) as (keyof Borrador)[]) delete respuestas[clave]
    paso.value = 'bienvenida'
    error.value = null
    uuid.value = null
    inicio = null
  }

  return {
    paso,
    respuestas,
    error,
    uuid,
    origen,
    progreso,
    puedeAvanzar,
    comenzar,
    responder,
    responderOtro,
    siguiente,
    atras,
    duracionSeg,
    construirRespuesta,
    reiniciar,
  }
}
