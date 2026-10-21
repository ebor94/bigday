import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'
import {
  PARALLAX_MAX_PX,
  desplazamientoPuntero,
  desplazamientoScroll,
  useParallax,
} from '../src/composables/useParallax'

describe('desplazamientoPuntero', () => {
  it('no desplaza con el puntero en el centro', () => {
    const d = desplazamientoPuntero(500, 400, 1000, 800, 1)
    expect(d.x).toBeCloseTo(0)
    expect(d.y).toBeCloseTo(0)
  })

  it('desplaza en sentido contrario al puntero, escalado por la profundidad', () => {
    expect(desplazamientoPuntero(1000, 800, 1000, 800, 1)).toEqual({
      x: -PARALLAX_MAX_PX,
      y: -PARALLAX_MAX_PX,
    })
    expect(desplazamientoPuntero(0, 0, 1000, 800, 0.5)).toEqual({
      x: PARALLAX_MAX_PX / 2,
      y: PARALLAX_MAX_PX / 2,
    })
  })

  it('limita valores fuera de la ventana', () => {
    expect(desplazamientoPuntero(5000, -5000, 1000, 800, 1)).toEqual({
      x: -PARALLAX_MAX_PX,
      y: PARALLAX_MAX_PX,
    })
  })
})

describe('desplazamientoScroll', () => {
  it('sube la capa con el scroll y nunca supera el máximo', () => {
    expect(desplazamientoScroll(0, 1)).toEqual({ x: 0, y: 0 })
    expect(desplazamientoScroll(40, 1).y).toBeLessThan(0)
    expect(desplazamientoScroll(100000, 1).y).toBe(-PARALLAX_MAX_PX * 2)
  })
})

type Consultas = Record<string, boolean>

function simularMatchMedia(consultas: Consultas) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: consultas[query] ?? false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

/** matchMedia mutable: permite disparar `change` como lo haría el navegador. */
function simularMatchMediaMutable(consultas: Consultas) {
  const oyentes = new Map<string, Set<() => void>>()
  vi.stubGlobal('matchMedia', (query: string) => {
    const set = oyentes.get(query) ?? new Set<() => void>()
    oyentes.set(query, set)
    return {
      get matches() {
        return consultas[query] ?? false
      },
      media: query,
      addEventListener: (_tipo: string, fn: () => void) => set.add(fn),
      removeEventListener: (_tipo: string, fn: () => void) => set.delete(fn),
    }
  })
  return (query: string, matches: boolean) => {
    consultas[query] = matches
    for (const fn of oyentes.get(query) ?? []) fn()
  }
}

function montar() {
  const Prueba = defineComponent({
    setup() {
      const raiz = ref<HTMLElement | null>(null)
      useParallax(raiz)
      return () => h('div', { ref: raiz }, [h('div', { 'data-profundidad': '1', class: 'capa' })])
    },
  })
  const contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
  const app = createApp(Prueba)
  app.mount(contenedor)
  const capa = contenedor.querySelector<HTMLElement>('.capa')
  if (!capa) throw new Error('falta la capa')
  return { app, capa }
}

describe('useParallax', () => {
  let agregar: MockInstance
  let quitar: MockInstance

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    agregar = vi.spyOn(window, 'addEventListener')
    quitar = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  const eventosParallax = (spy: MockInstance) =>
    spy.mock.calls.map((c) => c[0]).filter((t) => t === 'pointermove' || t === 'scroll')

  it('no escucha nada con prefers-reduced-motion: reduce', () => {
    simularMatchMedia({ '(prefers-reduced-motion: reduce)': true, '(pointer: fine)': true })
    const { capa } = montar()
    expect(eventosParallax(agregar)).toEqual([])
    expect(capa.style.transform).toBe('')
  })

  it('con puntero fino mueve las capas solo con transform y escucha en modo pasivo', () => {
    simularMatchMedia({ '(pointer: fine)': true })
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    const { capa } = montar()
    const llamada = agregar.mock.calls.find((c) => c[0] === 'pointermove')
    expect(llamada?.[2]).toMatchObject({ passive: true })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1000, clientY: 800 }))
    expect(capa.style.transform).toBe(`translate3d(${-PARALLAX_MAX_PX}px, ${-PARALLAX_MAX_PX}px, 0)`)
  })

  it('sin puntero fino usa el scroll como respaldo', () => {
    simularMatchMedia({})
    montar()
    expect(eventosParallax(agregar)).toEqual(['scroll'])
  })

  it('retira los listeners al desmontar', () => {
    simularMatchMedia({ '(pointer: fine)': true })
    const { app } = montar()
    app.unmount()
    expect(eventosParallax(quitar)).toEqual(['pointermove'])
  })

  it('reacciona en vivo al cambio de prefers-reduced-motion', () => {
    const cambiar = simularMatchMediaMutable({ '(pointer: fine)': true })
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    const { capa } = montar()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 0, clientY: 0 }))
    expect(capa.style.transform).not.toBe('')

    // Pasa a reduce: se retiran los listeners y se limpian los transforms en línea.
    agregar.mockClear()
    cambiar('(prefers-reduced-motion: reduce)', true)
    expect(eventosParallax(quitar)).toEqual(['pointermove'])
    expect(eventosParallax(agregar)).toEqual([])
    expect(capa.style.transform).toBe('')
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 0, clientY: 0 }))
    expect(capa.style.transform).toBe('')

    // Vuelve a no-reduce: se vuelve a escuchar el puntero.
    cambiar('(prefers-reduced-motion: reduce)', false)
    expect(eventosParallax(agregar)).toEqual(['pointermove'])
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1000, clientY: 800 }))
    expect(capa.style.transform).toBe(`translate3d(${-PARALLAX_MAX_PX}px, ${-PARALLAX_MAX_PX}px, 0)`)
  })
})
