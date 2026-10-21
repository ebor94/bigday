import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  AMBIENTE_INTERVALO_MAX_MS,
  AMBIENTE_INTERVALO_MIN_MS,
  MAX_AVES,
  crearBirds,
  posicionPosada,
  type Ave,
  type Punto,
} from '../src/composables/useBirds'

// Pseudoaleatorio determinista (mulberry32) para pruebas reproducibles.
function semilla(s: number) {
  let estado = s >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VISTA = { width: 375, height: 812 }

/** Documento simulado: `hidden` mutable y evento visibilitychange. */
function simularVisibilidad(inicial = false) {
  const oyentes = new Set<() => void>()
  const doc = {
    hidden: inicial,
    addEventListener: (_t: 'visibilitychange', fn: () => void) => oyentes.add(fn),
    removeEventListener: (_t: 'visibilitychange', fn: () => void) => oyentes.delete(fn),
  }
  return {
    doc,
    oyentes,
    cambiar(hidden: boolean) {
      doc.hidden = hidden
      for (const fn of [...oyentes]) fn()
    },
  }
}

function crear(opciones: { random?: () => number; reducido?: boolean; hidden?: boolean } = {}) {
  const reducedMotion = ref(opciones.reducido ?? false)
  const vis = simularVisibilidad(opciones.hidden ?? false)
  const store = crearBirds({
    random: opciones.random ?? semilla(42),
    viewport: () => VISTA,
    reducedMotion,
    visibilidad: vis.doc,
  })
  return { store, reducedMotion, vis }
}

function elemento(rect: { left: number; top: number; width: number; height: number }): Element {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top }) as DOMRect
  return el
}

/** Margen mínimo (px) fuera del viewport para que el ave no se vea al terminar. */
const MARGEN_FUERA = 40

function fueraDeVista(p: Punto) {
  return (
    p.x <= -MARGEN_FUERA ||
    p.x >= VISTA.width + MARGEN_FUERA ||
    p.y <= -MARGEN_FUERA ||
    p.y >= VISTA.height + MARGEN_FUERA
  )
}

const ultimo = <T>(lista: readonly T[]): T => {
  const v = lista[lista.length - 1]
  if (v === undefined) throw new Error('lista vacía')
  return v
}

const escalaX = (transform: string) => Number(/scale\((-?[\d.]+)/.exec(transform)?.[1])

describe('crearBirds — bandada (launchFlock)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('crea exactamente n aves de tipo flock', () => {
    const { store } = crear()
    const creadas = store.launchFlock({ x: 180, y: 400 }, 5)
    expect(creadas).toHaveLength(5)
    expect(store.aves.value).toHaveLength(5)
    expect(store.aves.value.every((a) => a.tipo === 'flock')).toBe(true)
  })

  it('las trayectorias empiezan en el origen y terminan fuera del viewport', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      const { store } = crear({ random: semilla(s) })
      const origen = { x: 40 + s * 50, y: 150 + s * 100 }
      for (const ave of store.launchFlock(origen, 6)) {
        expect(ave.trayecto[0]).toEqual(origen)
        expect(fueraDeVista(ultimo(ave.trayecto)), JSON.stringify(ultimo(ave.trayecto))).toBe(true)
      }
    }
  })

  it('con un elemento usa el centro de su rectángulo como origen', () => {
    const { store } = crear()
    const [ave] = store.launchFlock(elemento({ left: 20, top: 300, width: 200, height: 60 }), 1)
    expect(ave?.trayecto[0]).toEqual({ x: 120, y: 330 })
  })

  it(`nunca supera ${MAX_AVES} aves activas`, () => {
    const { store } = crear()
    expect(store.launchFlock({ x: 100, y: 100 }, 10)).toHaveLength(10)
    expect(store.launchFlock({ x: 100, y: 100 }, 10)).toHaveLength(2)
    expect(store.launchFlock({ x: 100, y: 100 }, 5)).toHaveLength(0)
    expect(store.aves.value).toHaveLength(MAX_AVES)
  })

  it('los fotogramas solo animan transform y opacity, con offsets crecientes de 0 a 1', () => {
    const { store } = crear()
    for (const ave of store.launchFlock({ x: 200, y: 500 }, 4)) {
      expect(ave.fotogramas.length).toBeGreaterThanOrEqual(3)
      for (const f of ave.fotogramas) {
        expect(Object.keys(f).sort()).toEqual(['offset', 'opacity', 'transform'])
        expect(f.transform).toMatch(/^translate\(-?[\d.]+px, -?[\d.]+px\) rotate\(-?[\d.]+deg\) scale\(-?[\d.]+, [\d.]+\)$/)
      }
      const offsets = ave.fotogramas.map((f) => f.offset)
      expect(offsets[0]).toBe(0)
      expect(ultimo(offsets)).toBe(1)
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
    }
  })

  it('la orientación (signo de scaleX) no cambia durante el vuelo', () => {
    const { store } = crear({ random: semilla(9) })
    for (const ave of store.launchFlock({ x: 187, y: 400 }, 6)) {
      const signos = new Set(ave.fotogramas.map((f) => Math.sign(escalaX(f.transform))))
      expect(signos.size).toBe(1)
    }
  })

  it('terminarVuelo retira el ave', () => {
    const { store } = crear()
    const [a, b] = store.launchFlock({ x: 100, y: 100 }, 2)
    store.terminarVuelo(a?.id ?? -1)
    expect(store.aves.value.map((x) => x.id)).toEqual([b?.id])
  })

  it('retira el ave por seguridad si nadie reporta el fin del vuelo', () => {
    const { store } = crear()
    const [ave] = store.launchFlock({ x: 100, y: 100 }, 1)
    if (!ave) throw new Error('sin ave')
    vi.advanceTimersByTime(ave.retraso + ave.duracion - 1)
    expect(store.aves.value).toHaveLength(1)
    vi.advanceTimersByTime(2000)
    expect(store.aves.value).toHaveLength(0)
  })
})

describe('crearBirds — vuelos ambientales', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** Avanza el reloj en pasos y registra cada oleada nueva (momento y aves). */
  function registrarOleadas(store: ReturnType<typeof crear>['store'], totalMs: number) {
    const vistas = new Set<number>()
    const oleadas: { t: number; aves: Ave[] }[] = []
    for (let t = 0; t <= totalMs; t += 100) {
      const nuevas = store.aves.value.filter((a) => a.tipo === 'ambient' && !vistas.has(a.id))
      if (nuevas.length) {
        nuevas.forEach((a) => vistas.add(a.id))
        oleadas.push({ t, aves: nuevas })
      }
      vi.advanceTimersByTime(100)
    }
    return oleadas
  }

  it('lanza oleadas de 2–4 aves cada 8–15 s', () => {
    for (const s of [3, 7, 11]) {
      const { store } = crear({ random: semilla(s) })
      store.startAmbient()
      const oleadas = registrarOleadas(store, 120_000)
      expect(oleadas.length).toBeGreaterThanOrEqual(7)
      for (const o of oleadas) {
        expect(o.aves.length).toBeGreaterThanOrEqual(2)
        expect(o.aves.length).toBeLessThanOrEqual(4)
      }
      for (let i = 1; i < oleadas.length; i++) {
        const salto = (oleadas[i]?.t ?? 0) - (oleadas[i - 1]?.t ?? 0)
        expect(salto).toBeGreaterThanOrEqual(AMBIENTE_INTERVALO_MIN_MS)
        expect(salto).toBeLessThanOrEqual(AMBIENTE_INTERVALO_MAX_MS)
      }
      store.destruir()
    }
  })

  it('respeta los extremos del intervalo con random = 0 y random ≈ 1', () => {
    for (const valor of [0, 0.9999]) {
      const { store } = crear({ random: () => valor })
      store.startAmbient()
      const oleadas = registrarOleadas(store, 60_000)
      const salto = (oleadas[2]?.t ?? 0) - (oleadas[1]?.t ?? 0)
      expect(salto).toBe(valor === 0 ? AMBIENTE_INTERVALO_MIN_MS : AMBIENTE_INTERVALO_MAX_MS)
      store.destruir()
    }
  })

  it('las aves ambientales cruzan la pantalla: entran por un lado y salen por el otro', () => {
    const { store } = crear({ random: semilla(5) })
    store.startAmbient()
    const aves = registrarOleadas(store, 60_000).flatMap((o) => o.aves)
    for (const ave of aves) {
      const ini = ave.trayecto[0] as Punto
      const fin = ultimo(ave.trayecto)
      expect(fueraDeVista(ini)).toBe(true)
      expect(fueraDeVista(fin)).toBe(true)
      const izquierdaADerecha = ini.x < 0 && fin.x > VISTA.width
      const derechaAIzquierda = ini.x > VISTA.width && fin.x < 0
      expect(izquierdaADerecha || derechaAIzquierda).toBe(true)
    }
    store.destruir()
  })

  it('varía escala y velocidad para dar profundidad (las lejanas son más lentas)', () => {
    const { store } = crear({ random: semilla(8) })
    store.startAmbient()
    const aves = registrarOleadas(store, 90_000).flatMap((o) => o.aves)
    const escalas = new Set(aves.map((a) => a.escala))
    expect(escalas.size).toBeGreaterThan(3)
    const porEscala = [...aves].sort((a, b) => a.escala - b.escala)
    expect(porEscala[0]?.duracion).toBeGreaterThan(ultimo(porEscala).duracion)
    store.destruir()
  })

  it('omite la oleada cuando ya hay el máximo de aves', () => {
    const { store } = crear()
    for (let i = 0; i < MAX_AVES; i++) store.perchAt(elemento({ left: i * 10, top: 50, width: 10, height: 10 }))
    store.startAmbient()
    vi.advanceTimersByTime(40_000)
    expect(store.aves.value.filter((a) => a.tipo === 'ambient')).toHaveLength(0)
    expect(store.aves.value).toHaveLength(MAX_AVES)
    store.destruir()
  })

  it('stopAmbient cancela las oleadas pendientes', () => {
    const { store } = crear()
    store.startAmbient()
    store.stopAmbient()
    vi.advanceTimersByTime(60_000)
    expect(store.aves.value).toHaveLength(0)
  })
})

describe('crearBirds — prefers-reduced-motion', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('no programa vuelos ambientales', () => {
    const { store } = crear({ reducido: true })
    store.startAmbient()
    vi.advanceTimersByTime(120_000)
    expect(store.aves.value).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('launchFlock no crea aves voladoras', () => {
    const { store } = crear({ reducido: true })
    expect(store.launchFlock({ x: 100, y: 100 }, 5)).toEqual([])
    expect(store.aves.value).toHaveLength(0)
  })

  it('perchAt sigue posando un ave estática', () => {
    const { store } = crear({ reducido: true })
    store.perchAt(elemento({ left: 10, top: 10, width: 40, height: 40 }))
    const [ave] = store.aves.value
    expect(ave?.tipo).toBe('perched')
    expect(ave?.fotogramas).toEqual([])
    expect(ave?.aletea).toBe(false)
  })

  it('al activarse en vivo retira las aves en vuelo y detiene el ambiente; al desactivarse lo reanuda', async () => {
    const { store, reducedMotion } = crear()
    store.startAmbient()
    store.launchFlock({ x: 100, y: 100 }, 3)
    store.perchAt(elemento({ left: 10, top: 10, width: 40, height: 40 }))
    reducedMotion.value = true
    await Promise.resolve()
    expect(store.aves.value.map((a) => a.tipo)).toEqual(['perched'])
    vi.advanceTimersByTime(60_000)
    expect(store.aves.value.filter((a) => a.tipo === 'ambient')).toHaveLength(0)

    reducedMotion.value = false
    await Promise.resolve()
    vi.advanceTimersByTime(AMBIENTE_INTERVALO_MAX_MS)
    expect(store.aves.value.filter((a) => a.tipo === 'ambient').length).toBeGreaterThanOrEqual(2)
    store.destruir()
  })
})

describe('crearBirds — document.hidden', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('con la pestaña oculta no programa oleadas y las reanuda al volver', () => {
    const { store, vis } = crear({ hidden: true })
    expect(store.oculto.value).toBe(true)
    store.startAmbient()
    vi.advanceTimersByTime(60_000)
    expect(store.aves.value).toHaveLength(0)

    vis.cambiar(false)
    expect(store.oculto.value).toBe(false)
    vi.advanceTimersByTime(AMBIENTE_INTERVALO_MAX_MS)
    expect(store.aves.value.length).toBeGreaterThanOrEqual(2)
    store.destruir()
  })

  it('al ocultarse pausa la programación pendiente', () => {
    const { store, vis } = crear()
    store.startAmbient()
    vis.cambiar(true)
    expect(store.oculto.value).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(store.aves.value.filter((a) => a.tipo === 'ambient')).toHaveLength(0)
    store.destruir()
  })

  it('destruir retira el listener de visibilidad y los temporizadores', () => {
    const { store, vis } = crear()
    store.startAmbient()
    store.launchFlock({ x: 50, y: 50 }, 2)
    store.destruir()
    expect(vis.oyentes.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('crearBirds — perchAt', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('posa un ave anclada al elemento y la libera con la función devuelta', () => {
    const { store } = crear()
    const el = elemento({ left: 100, top: 200, width: 80, height: 40 })
    const liberar = store.perchAt(el, { color: 'vermilion' })
    const [ave] = store.aves.value
    expect(ave).toMatchObject({ tipo: 'perched', color: 'vermilion', aletea: false })
    expect(ave?.ancla).toBe(el)
    liberar()
    expect(store.aves.value).toHaveLength(0)
    liberar() // idempotente
  })

  it('posicionPosada sitúa el ave en el centro del borde superior', () => {
    expect(posicionPosada({ left: 100, top: 200, width: 80, height: 40 })).toEqual({ x: 140, y: 200 })
  })

  it('con el máximo alcanzado desaloja el ave en vuelo más antigua', () => {
    const { store } = crear()
    const [primera] = store.launchFlock({ x: 100, y: 100 }, MAX_AVES)
    store.perchAt(elemento({ left: 0, top: 0, width: 10, height: 10 }))
    expect(store.aves.value).toHaveLength(MAX_AVES)
    expect(store.aves.value.some((a) => a.id === primera?.id)).toBe(false)
    expect(store.aves.value.filter((a) => a.tipo === 'perched')).toHaveLength(1)
  })

  it('si todas las aves están posadas no crea otra y devuelve una función inocua', () => {
    const { store } = crear()
    for (let i = 0; i < MAX_AVES; i++) store.perchAt(elemento({ left: 0, top: 0, width: 10, height: 10 }))
    const liberar = store.perchAt(elemento({ left: 0, top: 0, width: 10, height: 10 }))
    expect(store.aves.value).toHaveLength(MAX_AVES)
    liberar()
    expect(store.aves.value).toHaveLength(MAX_AVES)
  })
})
