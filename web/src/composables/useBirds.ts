import { computed, effectScope, ref, shallowRef, watch, type Ref } from 'vue'
import { useReducedMotion } from './useReducedMotion'

// Estado compartido de las aves animadas (singleton de módulo).
// - Ambiente: oleadas de 2–4 aves cada 8–15 s con trayectorias curvas que cruzan la pantalla.
// - Bandada: `launchFlock(origen, n)` hace despegar n aves desde una tarjeta hasta salir de pantalla.
// - Posada: `perchAt(elemento)` deja un ave quieta sobre un elemento (NPS, rama de progreso).
// Las trayectorias se entregan como fotogramas de `transform` y `opacity` únicamente;
// BirdLayer los reproduce con la Web Animations API.
// Azar, viewport, reduced-motion y visibilidad son inyectables para las pruebas.

export const MAX_AVES = 12
export const AMBIENTE_INTERVALO_MIN_MS = 8_000
export const AMBIENTE_INTERVALO_MAX_MS = 15_000
/** Primera oleada poco después de arrancar, para que el fondo se sienta vivo enseguida. */
export const PRIMERA_OLEADA_MS = 2_500
/** Margen tras el fin teórico del vuelo antes de retirar el ave por seguridad. */
const MARGEN_SEGURIDAD_MS = 1_000
/** Distancia (px) fuera del viewport donde nacen y mueren las aves. */
const FUERA_PX = 80
const MUESTRAS = 8

export type TipoAve = 'ambient' | 'flock' | 'perched'
export type ColorAve = 'teal' | 'vermilion' | 'mustard'
export const COLORES_AVE: readonly ColorAve[] = ['teal', 'vermilion', 'mustard']

export interface Punto {
  x: number
  y: number
}

// Alias (no interface) para que sea asignable a `Keyframe` de la Web Animations API.
export type Fotograma = {
  offset: number
  transform: string
  opacity: number
}

export interface Ave {
  id: number
  tipo: TipoAve
  color: ColorAve
  escala: number
  /** Posiciones (centro del ave, px de viewport) muestreadas de la curva. */
  trayecto: Punto[]
  fotogramas: Fotograma[]
  duracion: number
  retraso: number
  aletea: boolean
  /** Solo aves posadas: elemento sobre el que se posan. */
  ancla?: Element
}

export interface Visibilidad {
  readonly hidden: boolean
  addEventListener(tipo: 'visibilitychange', fn: () => void): void
  removeEventListener(tipo: 'visibilitychange', fn: () => void): void
}

export interface OpcionesBirds {
  random?: () => number
  viewport?: () => { width: number; height: number }
  reducedMotion?: Readonly<Ref<boolean>>
  visibilidad?: Visibilidad | null
}

export interface BirdsStore {
  aves: Readonly<Ref<readonly Ave[]>>
  /** `true` mientras la pestaña está oculta (BirdLayer pausa las animaciones). */
  oculto: Readonly<Ref<boolean>>
  launchFlock(origen: Element | Punto, cantidad: number): Ave[]
  perchAt(elemento: Element, opciones?: { color?: ColorAve }): () => void
  startAmbient(): void
  stopAmbient(): void
  /** BirdLayer lo llama al terminar la animación de vuelo. */
  terminarVuelo(id: number): void
  destruir(): void
}

type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

/** Punto donde se posa un ave: centro del borde superior del elemento. */
export function posicionPosada(rect: Rect): Punto {
  return { x: rect.left + rect.width / 2, y: rect.top }
}

const r2 = (v: number) => Math.round(v * 100) / 100 + 0
const r1 = (v: number) => Math.round(v * 10) / 10 + 0
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function bezier(p: readonly [Punto, Punto, Punto, Punto], t: number): Punto {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
    y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
  }
}

function tangente(p: readonly [Punto, Punto, Punto, Punto], t: number): Punto {
  const u = 1 - t
  return {
    x: 3 * u * u * (p[1].x - p[0].x) + 6 * u * t * (p[2].x - p[1].x) + 3 * t * t * (p[3].x - p[2].x),
    y: 3 * u * u * (p[1].y - p[0].y) + 6 * u * t * (p[2].y - p[1].y) + 3 * t * t * (p[3].y - p[2].y),
  }
}

/** Inclinación (grados) del ave según su rumbo; mirando a la izquierda se refleja. */
function inclinacion(d: Punto, haciaIzquierda: boolean): number {
  let grados = (Math.atan2(d.y, d.x) * 180) / Math.PI
  if (haciaIzquierda) {
    grados -= 180
    if (grados < -180) grados += 360
  }
  return limitar(grados, -40, 40)
}

interface Vuelo {
  curva: readonly [Punto, Punto, Punto, Punto]
  escala: number
  /** Opacidad de crucero (las aves lejanas se ven más tenues). */
  opacidad: number
  /** Aparece con un fundido inicial (despegue desde una tarjeta). */
  fundidoEntrada: boolean
  /** Reparto del avance en el tiempo: 1 = uniforme, >1 = acelera (despegue). */
  aceleracion: number
}

function construirVuelo(v: Vuelo): Pick<Ave, 'trayecto' | 'fotogramas'> {
  const haciaIzquierda = v.curva[3].x < v.curva[0].x
  const sx = haciaIzquierda ? -v.escala : v.escala
  const trayecto: Punto[] = []
  const fotogramas: Fotograma[] = []
  for (let i = 0; i < MUESTRAS; i++) {
    const offset = i / (MUESTRAS - 1)
    const t = offset ** v.aceleracion
    const p = bezier(v.curva, t)
    const punto = { x: r1(p.x), y: r1(p.y) }
    trayecto.push(punto)
    const rot = r2(inclinacion(tangente(v.curva, Math.max(t, 0.02)), haciaIzquierda))
    fotogramas.push({
      offset: r2(offset),
      transform: `translate(${punto.x}px, ${punto.y}px) rotate(${rot}deg) scale(${r2(sx)}, ${r2(v.escala)})`,
      opacity: v.fundidoEntrada && i === 0 ? 0 : v.opacidad,
    })
  }
  return { trayecto, fotogramas }
}

export function crearBirds(opciones: OpcionesBirds = {}): BirdsStore {
  const random = opciones.random ?? Math.random
  const viewport = opciones.viewport ?? (() => ({ width: window.innerWidth, height: window.innerHeight }))
  const visibilidad =
    opciones.visibilidad !== undefined ? opciones.visibilidad : typeof document !== 'undefined' ? document : null

  const scope = effectScope(true)
  const reducido = opciones.reducedMotion ?? scope.run(() => useReducedMotion()) ?? ref(false)
  const aves = shallowRef<readonly Ave[]>([])
  const oculto = ref(visibilidad?.hidden ?? false)
  const seguridad = new Map<number, ReturnType<typeof setTimeout>>()
  let siguienteId = 1
  let ambienteDeseado = false
  let temporizadorAmbiente: ReturnType<typeof setTimeout> | null = null

  const entre = (min: number, max: number) => min + random() * (max - min)
  const colorAlAzar = (): ColorAve => COLORES_AVE[Math.floor(random() * COLORES_AVE.length)] ?? 'vermilion'
  const libres = () => MAX_AVES - aves.value.length

  function quitar(ids: ReadonlySet<number>) {
    if (!ids.size) return
    for (const id of ids) {
      const t = seguridad.get(id)
      if (t !== undefined) clearTimeout(t)
      seguridad.delete(id)
    }
    aves.value = aves.value.filter((a) => !ids.has(a.id))
  }

  function agregarVoladoras(nuevas: Ave[]) {
    for (const ave of nuevas) {
      seguridad.set(
        ave.id,
        setTimeout(() => quitar(new Set([ave.id])), ave.retraso + ave.duracion + MARGEN_SEGURIDAD_MS),
      )
    }
    aves.value = [...aves.value, ...nuevas]
  }

  // ── Ambiente ─────────────────────────────────────────────

  function aveAmbiental(haciaDerecha: boolean, retraso: number): Ave {
    const { width: w, height: h } = viewport()
    // Profundidad: escala pequeña = lejos = más lenta y más tenue.
    const escala = r2(entre(0.45, 1.05))
    const lejania = (1.05 - escala) / 0.6
    const duracion = Math.round(9_000 + lejania * 7_000 + entre(-400, 400))
    const yIni = h * entre(0.08, 0.58)
    const yFin = limitar(yIni + h * entre(-0.15, 0.15), h * 0.04, h * 0.7)
    const xIni = haciaDerecha ? -FUERA_PX : w + FUERA_PX
    const xFin = haciaDerecha ? w + FUERA_PX : -FUERA_PX
    const curva = [
      { x: xIni, y: yIni },
      { x: lerp(xIni, xFin, 1 / 3), y: yIni + h * entre(-0.18, 0.18) },
      { x: lerp(xIni, xFin, 2 / 3), y: yFin + h * entre(-0.18, 0.18) },
      { x: xFin, y: yFin },
    ] as const
    return {
      id: siguienteId++,
      tipo: 'ambient',
      color: colorAlAzar(),
      escala,
      duracion,
      retraso,
      aletea: true,
      ...construirVuelo({ curva, escala, opacidad: r2(1 - lejania * 0.45), fundidoEntrada: false, aceleracion: 1 }),
    }
  }

  function oleada() {
    const cantidad = Math.min(2 + Math.floor(random() * 3), libres())
    if (cantidad <= 0) return
    const haciaDerecha = random() < 0.5
    const nuevas: Ave[] = []
    let retraso = 0
    for (let i = 0; i < cantidad; i++) {
      nuevas.push(aveAmbiental(haciaDerecha, Math.round(retraso)))
      retraso += entre(300, 1_200)
    }
    agregarVoladoras(nuevas)
  }

  /** Intervalo entre oleadas, con resolución de 100 ms. */
  const intervalo = () =>
    Math.round(entre(AMBIENTE_INTERVALO_MIN_MS, AMBIENTE_INTERVALO_MAX_MS) / 100) * 100

  function cancelarAmbiente() {
    if (temporizadorAmbiente !== null) clearTimeout(temporizadorAmbiente)
    temporizadorAmbiente = null
  }

  function programarAmbiente(espera: number) {
    cancelarAmbiente()
    if (!ambienteDeseado || reducido.value || oculto.value) return
    temporizadorAmbiente = setTimeout(() => {
      temporizadorAmbiente = null
      oleada()
      programarAmbiente(intervalo())
    }, espera)
  }

  // ── Bandada ──────────────────────────────────────────────

  function aveDeBandada(origen: Punto, indice: number): Ave {
    const { width: w, height: h } = viewport()
    // Rumbo hacia arriba con apertura amplia (−171° a −9°).
    const angulo = -Math.PI / 2 + (random() - 0.5) * Math.PI * 0.9
    const dir = { x: Math.cos(angulo), y: Math.sin(angulo) }
    const perp = { x: -dir.y, y: dir.x }
    // Más larga que la diagonal del viewport ampliado: el final siempre queda fuera.
    const distancia = Math.hypot(w + 2 * FUERA_PX, h + 2 * FUERA_PX) + 20
    const curvaA = (random() - 0.5) * distancia * 0.4
    const curvaB = (random() - 0.5) * distancia * 0.3
    const en = (k: number, lateral: number) => ({
      x: origen.x + dir.x * distancia * k + perp.x * lateral,
      y: origen.y + dir.y * distancia * k + perp.y * lateral,
    })
    const curva = [origen, en(0.3, curvaA), en(0.65, curvaB), en(1, 0)] as const
    const escala = r2(entre(0.7, 1))
    return {
      id: siguienteId++,
      tipo: 'flock',
      color: colorAlAzar(),
      escala,
      duracion: Math.round(entre(1_800, 2_600)),
      retraso: Math.round(indice * entre(70, 160)),
      aletea: true,
      ...construirVuelo({ curva, escala, opacidad: 1, fundidoEntrada: true, aceleracion: 1.5 }),
    }
  }

  function launchFlock(origen: Element | Punto, cantidad: number): Ave[] {
    if (reducido.value) return []
    const n = Math.min(Math.max(0, Math.floor(cantidad)), libres())
    if (n <= 0) return []
    let punto: Punto
    if ('getBoundingClientRect' in origen) {
      const rect = origen.getBoundingClientRect()
      punto = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    } else {
      punto = { x: origen.x, y: origen.y }
    }
    const nuevas = Array.from({ length: n }, (_, i) => aveDeBandada(punto, i))
    agregarVoladoras(nuevas)
    return nuevas
  }

  // ── Posada ───────────────────────────────────────────────

  function perchAt(elemento: Element, opcionesPosada: { color?: ColorAve } = {}): () => void {
    if (libres() <= 0) {
      // Prioridad a la posada: se desaloja el ave en vuelo más antigua.
      const enVuelo = aves.value.find((a) => a.tipo !== 'perched')
      if (!enVuelo) return () => {}
      quitar(new Set([enVuelo.id]))
    }
    const escala = 0.7
    const aterrizaje: Fotograma[] = reducido.value
      ? []
      : [
          { offset: 0, transform: 'translate(0px, -14px) rotate(-8deg) scale(1, 1)', opacity: 0 },
          { offset: 1, transform: 'translate(0px, 0px) rotate(0deg) scale(1, 1)', opacity: 1 },
        ]
    const ave: Ave = {
      id: siguienteId++,
      tipo: 'perched',
      color: opcionesPosada.color ?? 'vermilion',
      escala,
      trayecto: [],
      fotogramas: aterrizaje,
      duracion: aterrizaje.length ? 450 : 0,
      retraso: 0,
      aletea: false,
      ancla: elemento,
    }
    aves.value = [...aves.value, ave]
    return () => quitar(new Set([ave.id]))
  }

  // ── Ciclo de vida ────────────────────────────────────────

  function alCambiarVisibilidad() {
    oculto.value = visibilidad?.hidden ?? false
    if (oculto.value) cancelarAmbiente()
    else programarAmbiente(intervalo())
  }
  visibilidad?.addEventListener('visibilitychange', alCambiarVisibilidad)

  scope.run(() => {
    watch(
      reducido,
      (activo) => {
        if (activo) {
          cancelarAmbiente()
          quitar(new Set(aves.value.filter((a) => a.tipo !== 'perched').map((a) => a.id)))
        } else {
          programarAmbiente(intervalo())
        }
      },
      { flush: 'sync' },
    )
  })

  return {
    // computed (no readonly): entrega los objetos tal cual, sin proxies sobre el elemento ancla.
    aves: computed(() => aves.value),
    oculto: computed(() => oculto.value),
    launchFlock,
    perchAt,
    startAmbient() {
      if (ambienteDeseado && temporizadorAmbiente !== null) return
      ambienteDeseado = true
      programarAmbiente(PRIMERA_OLEADA_MS)
    },
    stopAmbient() {
      ambienteDeseado = false
      cancelarAmbiente()
    },
    terminarVuelo(id: number) {
      quitar(new Set([id]))
    },
    destruir() {
      ambienteDeseado = false
      cancelarAmbiente()
      quitar(new Set(seguridad.keys()))
      visibilidad?.removeEventListener('visibilitychange', alCambiarVisibilidad)
      scope.stop()
    },
  }
}

let instancia: BirdsStore | null = null

/** Store compartido por BirdLayer y cualquier componente que quiera lanzar o posar aves. */
export function useBirds(): BirdsStore {
  instancia ??= crearBirds()
  return instancia
}
