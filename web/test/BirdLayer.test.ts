import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type Component } from 'vue'
import type { BirdsStore } from '../src/composables/useBirds'

// BirdLayer contra el store real (singleton): cada prueba importa módulos nuevos.
// happy-dom no implementa WAAPI ni ResizeObserver: se simulan y se registran las llamadas.

interface AnimFalsa {
  objetivo: Element
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  playState: string
  onfinish: (() => void) | null
}

let animaciones: AnimFalsa[]
let observadores: { observados: Element[]; desobservados: Element[]; desconectado: boolean; cb: () => void }[]
let oculto = false

function rect(left: number, top: number, width: number, height: number) {
  return () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect
}

async function cargar() {
  const { useBirds } = await import('../src/composables/useBirds')
  const BirdLayer = (await import('../src/components/BirdLayer.vue')).default as Component
  return { store: useBirds() as BirdsStore, BirdLayer }
}

function montar(BirdLayer: Component) {
  const contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
  const app = createApp(BirdLayer)
  app.mount(contenedor)
  return { app, contenedor }
}

describe('BirdLayer', () => {
  beforeEach(() => {
    vi.resetModules()
    animaciones = []
    observadores = []
    oculto = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculto })
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    HTMLElement.prototype.animate = vi.fn(function (this: Element) {
      const anim: AnimFalsa = {
        objetivo: this,
        pause: vi.fn(),
        play: vi.fn(),
        cancel: vi.fn(),
        playState: 'running',
        onfinish: null,
      }
      animaciones.push(anim)
      return anim as unknown as Animation
    }) as unknown as typeof HTMLElement.prototype.animate
    vi.stubGlobal(
      'ResizeObserver',
      class {
        registro: (typeof observadores)[number]
        constructor(cb: () => void) {
          this.registro = { observados: [], desobservados: [], desconectado: false, cb }
          observadores.push(this.registro)
        }
        observe(el: Element) {
          this.registro.observados.push(el)
        }
        unobserve(el: Element) {
          this.registro.desobservados.push(el)
        }
        disconnect() {
          this.registro.desconectado = true
        }
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('al montarse con aves ya existentes coloca la posada y anima la que vuela', async () => {
    const { store, BirdLayer } = await cargar()
    const ancla = document.createElement('button')
    ancla.getBoundingClientRect = rect(100, 200, 80, 40)
    store.perchAt(ancla)
    const [voladora] = store.launchFlock({ x: 50, y: 50 }, 1)
    const { contenedor } = montar(BirdLayer)
    await nextTick()

    const posada = contenedor.querySelector<HTMLElement>('.ave--perched')
    expect(posada?.style.transform).toBe('translate(140px, 190px) scale(0.7)')
    const volando = contenedor.querySelector(`[data-ave="${voladora?.id}"]`)
    expect(volando).not.toBeNull()
    expect(animaciones.some((a) => a.objetivo.closest('.ave') === volando)).toBe(true)
    expect(store.aves.value.some((a) => a.id === voladora?.id)).toBe(true)
  })

  it('las aves ambientales van en la capa de fondo y las demás en la capa frontal', async () => {
    const { store, BirdLayer } = await cargar()
    const { contenedor } = montar(BirdLayer)
    vi.useFakeTimers()
    store.startAmbient()
    vi.advanceTimersByTime(3_000)
    vi.useRealTimers()
    store.launchFlock({ x: 50, y: 50 }, 2)
    const ancla = document.createElement('div')
    ancla.getBoundingClientRect = rect(0, 0, 10, 10)
    store.perchAt(ancla)
    await nextTick()
    const fondo = contenedor.querySelector('.capa-aves--fondo')
    const frente = contenedor.querySelector('.capa-aves--frente')
    expect(fondo?.querySelectorAll('.ave--ambient').length).toBeGreaterThanOrEqual(2)
    expect(fondo?.querySelectorAll('.ave--flock, .ave--perched').length).toBe(0)
    expect(frente?.querySelectorAll('.ave--flock').length).toBe(2)
    expect(frente?.querySelectorAll('.ave--perched').length).toBe(1)
    expect(frente?.querySelectorAll('.ave--ambient').length).toBe(0)
    store.stopAmbient()
  })

  it('pausa los vuelos cuando document.hidden pasa a true y los reanuda al volver', async () => {
    const { store, BirdLayer } = await cargar()
    montar(BirdLayer)
    store.launchFlock({ x: 50, y: 50 }, 2)
    await nextTick()
    expect(animaciones).toHaveLength(2)
    oculto = true
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    for (const a of animaciones) expect(a.pause).toHaveBeenCalled()
    oculto = false
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    for (const a of animaciones) expect(a.play).toHaveBeenCalled()
  })

  it('el ave posada sigue los cambios de tamaño de su ancla y deja de observarla al liberarse', async () => {
    const { store, BirdLayer } = await cargar()
    const ancla = document.createElement('div')
    ancla.getBoundingClientRect = rect(100, 200, 80, 40)
    const liberar = store.perchAt(ancla)
    const { app, contenedor } = montar(BirdLayer)
    await nextTick()
    const observador = observadores[0]
    expect(observador?.observados).toContain(ancla)

    ancla.getBoundingClientRect = rect(100, 260, 120, 40)
    observador?.cb()
    expect(contenedor.querySelector<HTMLElement>('.ave--perched')?.style.transform).toBe(
      'translate(160px, 250px) scale(0.7)',
    )

    liberar()
    await nextTick()
    expect(observador?.desobservados).toContain(ancla)
    app.unmount()
    expect(observador?.desconectado).toBe(true)
  })
})
