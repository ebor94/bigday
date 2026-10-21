import { afterEach, describe, expect, it, vi } from 'vitest'
import { QUESTIONS, OTRO_MAX, respuestaSchema } from '@bigday/shared'
import { generarUuid, useSurvey } from '../src/composables/useSurvey'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Reloj controlable en milisegundos. */
function reloj(inicio = 1_000_000) {
  let t = inicio
  return { ahora: () => t, avanzar: (ms: number) => (t += ms) }
}

/** Contesta todo con valores válidos hasta llegar a P7 (sin avanzar de P7). */
function responderTodo(s: ReturnType<typeof useSurvey>) {
  s.comenzar()
  s.responder('p1', 'A')
  s.siguiente()
  s.responder('p2', 'ambas')
  s.siguiente()
  s.responder('p3', 'memoria')
  s.siguiente()
  s.responder('p4', 'diversidad')
  s.siguiente()
  s.responder('p5', 'B')
  s.siguiente()
  s.responder('p6', 9)
  s.siguiente()
  s.responder('p7', 'Un lugar lleno de vida')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('navegación', () => {
  it('empieza en la bienvenida y comenzar() pasa a p1', () => {
    const s = useSurvey()
    expect(s.paso.value).toBe('bienvenida')
    s.comenzar()
    expect(s.paso.value).toBe('p1')
  })

  it('avanza con siguiente() cuando la pregunta es válida y recorre p1..p7 hasta gracias', () => {
    const s = useSurvey()
    responderTodo(s)
    expect(s.paso.value).toBe('p7')
    expect(s.siguiente()).toBe(true)
    expect(s.paso.value).toBe('gracias')
  })

  it('no avanza si la pregunta obligatoria está vacía y expone un mensaje en español', () => {
    const s = useSurvey()
    s.comenzar()
    expect(s.puedeAvanzar.value).toBe(false)
    expect(s.siguiente()).toBe(false)
    expect(s.paso.value).toBe('p1')
    expect(s.error.value).toMatch(/opción/i)
  })

  it('puedeAvanzar se vuelve true al responder y el error se limpia al avanzar', () => {
    const s = useSurvey()
    s.comenzar()
    s.siguiente()
    expect(s.error.value).not.toBeNull()
    s.responder('p1', 'C')
    expect(s.puedeAvanzar.value).toBe(true)
    expect(s.siguiente()).toBe(true)
    expect(s.error.value).toBeNull()
  })

  it('atras() vuelve a la pregunta anterior conservando respuestas', () => {
    const s = useSurvey()
    s.comenzar()
    s.responder('p1', 'D')
    s.siguiente()
    expect(s.paso.value).toBe('p2')
    s.atras()
    expect(s.paso.value).toBe('p1')
    expect(s.respuestas.p1).toBe('D')
  })

  it('atras() desde p1 va a la bienvenida y nunca antes', () => {
    const s = useSurvey()
    s.comenzar()
    s.atras()
    expect(s.paso.value).toBe('bienvenida')
    s.atras()
    expect(s.paso.value).toBe('bienvenida')
  })

  it('expone el progreso (índice y total) a partir de QUESTIONS', () => {
    const s = useSurvey()
    expect(s.progreso.value).toEqual({ indice: 0, total: QUESTIONS.length })
    s.comenzar()
    expect(s.progreso.value.indice).toBe(1)
    s.responder('p1', 'A')
    s.siguiente()
    expect(s.progreso.value.indice).toBe(2)
  })
})

describe('irA', () => {
  it('desde gracias vuelve a P7 conservando las respuestas', () => {
    const s = useSurvey({ search: '' })
    responderTodo(s)
    expect(s.siguiente()).toBe(true)
    expect(s.paso.value).toBe('gracias')
    expect(s.irA('p7')).toBe(true)
    expect(s.paso.value).toBe('p7')
    expect(s.respuestas.p7).toBe('Un lugar lleno de vida')
  })

  it('va a cualquier pregunta ya visitada y limpia el error', () => {
    const s = useSurvey({ search: '' })
    s.comenzar()
    s.responder('p1', 'A')
    s.siguiente()
    s.siguiente() // p2 vacía: error
    expect(s.error.value).not.toBeNull()
    expect(s.irA('p1')).toBe(true)
    expect(s.paso.value).toBe('p1')
    expect(s.error.value).toBeNull()
    // La pregunta más avanzada visitada sigue alcanzable aunque ahora esté en p1.
    expect(s.irA('p2')).toBe(true)
    expect(s.paso.value).toBe('p2')
  })

  it('no salta a preguntas aún no visitadas ni desde la bienvenida', () => {
    const s = useSurvey({ search: '' })
    expect(s.irA('p1')).toBe(false)
    expect(s.paso.value).toBe('bienvenida')
    s.comenzar()
    expect(s.irA('p3')).toBe(false)
    expect(s.paso.value).toBe('p1')
  })

  it('tras reiniciar() olvida lo visitado', () => {
    const s = useSurvey({ search: '' })
    responderTodo(s)
    s.reiniciar()
    s.comenzar()
    expect(s.irA('p7')).toBe(false)
    expect(s.paso.value).toBe('p1')
  })
})

describe('validación por pregunta', () => {
  function enP3() {
    const s = useSurvey()
    s.comenzar()
    s.responder('p1', 'A')
    s.siguiente()
    s.responder('p2', 'ambas')
    s.siguiente()
    return s
  }

  it('"otro" exige texto', () => {
    const s = enP3()
    s.responder('p3', 'otro')
    expect(s.siguiente()).toBe(false)
    expect(s.error.value).toMatch(/otro/i)
    s.responderOtro('p3', '   ')
    expect(s.siguiente()).toBe(false)
    s.responderOtro('p3', 'Algo distinto')
    expect(s.siguiente()).toBe(true)
    expect(s.paso.value).toBe('p4')
  })

  it('"otro" rechaza texto mayor a OTRO_MAX y acepta exactamente OTRO_MAX', () => {
    const s = enP3()
    s.responder('p3', 'otro')
    s.responderOtro('p3', 'x'.repeat(OTRO_MAX + 1))
    expect(s.siguiente()).toBe(false)
    expect(s.error.value).toMatch(String(OTRO_MAX))
    s.responderOtro('p3', 'x'.repeat(OTRO_MAX))
    expect(s.siguiente()).toBe(true)
  })

  it('al cambiar p3 de "otro" a otra opción se borra el texto de otro', () => {
    const s = enP3()
    s.responder('p3', 'otro')
    s.responderOtro('p3', 'Algo')
    s.responder('p3', 'memoria')
    expect(s.respuestas.p3_otro).toBeUndefined()
  })

  it('el payload no arrastra p4_otro obsoleto', () => {
    const s = useSurvey()
    responderTodo(s)
    s.respuestas.p4 = 'otro'
    s.responderOtro('p4', 'temporal')
    s.responder('p4', 'cientifico')
    const r = s.construirRespuesta()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos).not.toHaveProperty('p4_otro')
  })

  it.each([
    [9, false],
    [10, true],
    [280, true],
    [281, false],
  ])('P7 con %i caracteres (tras trim) -> válido=%s', (largo, valido) => {
    const s = useSurvey()
    responderTodo(s)
    s.responder('p7', `  ${'a'.repeat(largo)}  `)
    expect(s.siguiente()).toBe(valido)
    if (!valido) expect(s.error.value).toMatch(/caracteres/i)
  })

  it('P7 de solo espacios no es válida', () => {
    const s = useSurvey()
    responderTodo(s)
    s.responder('p7', ' '.repeat(50))
    expect(s.siguiente()).toBe(false)
  })

  it.each([
    [0, false],
    [1, true],
    [10, true],
    [11, false],
  ])('P6 con %i -> válido=%s', (valor, valido) => {
    const s = useSurvey()
    responderTodo(s)
    s.atras()
    s.responder('p6', valor)
    expect(s.siguiente()).toBe(valido)
  })

  it('un código inexistente no es válido', () => {
    const s = useSurvey()
    s.comenzar()
    s.responder('p1', 'Z')
    expect(s.siguiente()).toBe(false)
  })
})

describe('uuid, duración y origen', () => {
  it('genera el uuid una sola vez por corrida (v4 válido)', () => {
    const s = useSurvey()
    expect(s.uuid.value).toBeNull()
    s.comenzar()
    const primero = s.uuid.value
    expect(primero).toMatch(UUID_V4)
    s.comenzar()
    expect(s.uuid.value).toBe(primero)
  })

  it('usa el respaldo con getRandomValues si no existe crypto.randomUUID', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const a = generarUuid()
    const b = generarUuid()
    expect(a).toMatch(UUID_V4)
    expect(b).toMatch(UUID_V4)
    expect(a).not.toBe(b)
    expect(respuestaSchema.shape.uuid.safeParse(a).success).toBe(true)
  })

  it('duracionSeg() son segundos enteros desde comenzar()', () => {
    const c = reloj()
    const s = useSurvey({ ahora: c.ahora })
    expect(s.duracionSeg()).toBe(0)
    s.comenzar()
    c.avanzar(12_999)
    expect(s.duracionSeg()).toBe(12)
    c.avanzar(1)
    expect(s.duracionSeg()).toBe(13)
  })

  it('comenzar() repetido no reinicia el cronómetro', () => {
    const c = reloj()
    const s = useSurvey({ ahora: c.ahora })
    s.comenzar()
    c.avanzar(5000)
    s.comenzar()
    expect(s.duracionSeg()).toBe(5)
  })

  it.each([
    ['?src=qr_entrada', 'qr_entrada'],
    ['?src=Cartel-1', 'cartel-1'],
    ['?src=a b', undefined],
    ['?src=a$b', undefined],
    ['?src=ñandú', undefined],
    [`?src=${'a'.repeat(41)}`, undefined],
    [`?src=${'a'.repeat(40)}`, 'a'.repeat(40)],
    ['', undefined],
    ['?src=', undefined],
    ['?otro=1', undefined],
  ])('origen desde %j -> %j', (search, esperado) => {
    const s = useSurvey({ search })
    expect(s.origen).toBe(esperado)
  })

  it('por defecto lee window.location.search', () => {
    window.history.replaceState({}, '', '/?src=Redes')
    try {
      expect(useSurvey().origen).toBe('redes')
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })
})

describe('construirRespuesta', () => {
  it('arma el payload con códigos, website vacío, origen y duración, validado por respuestaSchema', () => {
    const c = reloj()
    const s = useSurvey({ ahora: c.ahora, search: '?src=qr' })
    responderTodo(s)
    c.avanzar(42_000)
    const r = s.construirRespuesta()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.datos).toMatchObject({
      p1: 'A',
      p2: 'ambas',
      p3: 'memoria',
      p4: 'diversidad',
      p5: 'B',
      p6: 9,
      p7: 'Un lugar lleno de vida',
      origen: 'qr',
      duracion_seg: 42,
      website: '',
    })
    expect(r.datos.uuid).toBe(s.uuid.value)
    expect(respuestaSchema.safeParse(r.datos).success).toBe(true)
  })

  it('incluye p3_otro tras recortar espacios', () => {
    const s = useSurvey()
    responderTodo(s)
    s.responder('p3', 'otro')
    s.responderOtro('p3', '  mi texto  ')
    const r = s.construirRespuesta()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.p3_otro).toBe('mi texto')
  })

  it('omite origen cuando no hay ?src=', () => {
    const s = useSurvey({ search: '' })
    responderTodo(s)
    const r = s.construirRespuesta()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos).not.toHaveProperty('origen')
  })

  it('devuelve errores si falta algo', () => {
    const s = useSurvey()
    s.comenzar()
    s.responder('p1', 'A')
    const r = s.construirRespuesta()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.length).toBeGreaterThan(0)
  })
})

describe('reiniciar', () => {
  it('limpia respuestas, vuelve a la bienvenida y el siguiente comenzar() crea un uuid nuevo', () => {
    const c = reloj()
    const s = useSurvey({ ahora: c.ahora })
    responderTodo(s)
    const viejo = s.uuid.value
    c.avanzar(30_000)
    s.reiniciar()
    expect(s.paso.value).toBe('bienvenida')
    expect(s.respuestas.p1).toBeUndefined()
    expect(s.uuid.value).toBeNull()
    expect(s.error.value).toBeNull()
    s.comenzar()
    expect(s.uuid.value).toMatch(UUID_V4)
    expect(s.uuid.value).not.toBe(viejo)
    expect(s.duracionSeg()).toBe(0)
  })
})
