import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import { useReducedMotion } from './useReducedMotion'

// Parallax ligero para las capas de follaje del fondo.
// - Escritorio (puntero fino): las capas se desplazan en sentido contrario al mouse.
// - Móvil / sin puntero fino: respaldo por scroll.
// - Con prefers-reduced-motion: reduce no se escucha ningún evento.
// Solo se toca `transform`, limitado a un frame por requestAnimationFrame.

/** Desplazamiento máximo (px) de una capa con profundidad 1 por eje. */
export const PARALLAX_MAX_PX = 18

const FACTOR_SCROLL = 0.08

export interface Desplazamiento {
  x: number
  y: number
}

const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor))

/** Desplazamiento según la posición del puntero dentro de la ventana. */
export function desplazamientoPuntero(
  x: number,
  y: number,
  ancho: number,
  alto: number,
  profundidad: number,
): Desplazamiento {
  const nx = limitar(x / ancho, 0, 1) - 0.5
  const ny = limitar(y / alto, 0, 1) - 0.5
  // `+ 0` evita el -0 cuando el puntero está justo en el centro.
  return {
    x: -nx * 2 * PARALLAX_MAX_PX * profundidad + 0,
    y: -ny * 2 * PARALLAX_MAX_PX * profundidad + 0,
  }
}

/** Desplazamiento vertical según el scroll; nunca supera 2 × máximo. */
export function desplazamientoScroll(scrollY: number, profundidad: number): Desplazamiento {
  const tope = PARALLAX_MAX_PX * 2 * profundidad
  return { x: 0, y: -Math.min(Math.max(scrollY, 0) * FACTOR_SCROLL * profundidad, tope) + 0 }
}

const CONSULTA_PUNTERO = '(pointer: fine)'

export function useParallax(raiz: Ref<HTMLElement | null>): void {
  let limpiar: (() => void) | null = null
  let montado = false
  const reducido = useReducedMotion()
  let mqlPuntero: MediaQueryList | null = null

  function capas(): HTMLElement[] {
    return Array.from(raiz.value?.querySelectorAll<HTMLElement>('[data-profundidad]') ?? [])
  }

  function aplicar(calcular: (profundidad: number) => Desplazamiento) {
    for (const capa of capas()) {
      const { x, y } = calcular(Number(capa.dataset.profundidad) || 0)
      capa.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
  }

  function activar() {
    limpiar?.()
    limpiar = null

    if (!mqlPuntero || reducido.value) {
      for (const capa of capas()) capa.style.transform = ''
      return
    }

    let frame = 0
    const programar = (tarea: () => void) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        tarea()
      })
    }
    const opciones: AddEventListenerOptions = { passive: true }

    if (mqlPuntero?.matches) {
      const alMover = (e: PointerEvent) => {
        const { clientX, clientY } = e
        programar(() =>
          aplicar((p) => desplazamientoPuntero(clientX, clientY, window.innerWidth, window.innerHeight, p)),
        )
      }
      window.addEventListener('pointermove', alMover, opciones)
      limpiar = () => {
        window.removeEventListener('pointermove', alMover)
        if (frame) cancelAnimationFrame(frame)
      }
    } else {
      const alDesplazar = () => programar(() => aplicar((p) => desplazamientoScroll(window.scrollY, p)))
      window.addEventListener('scroll', alDesplazar, opciones)
      alDesplazar()
      limpiar = () => {
        window.removeEventListener('scroll', alDesplazar)
        if (frame) cancelAnimationFrame(frame)
      }
    }
  }

  onMounted(() => {
    if (typeof window.matchMedia !== 'function') return
    mqlPuntero = window.matchMedia(CONSULTA_PUNTERO)
    mqlPuntero.addEventListener('change', activar)
    montado = true
    activar()
  })

  onBeforeUnmount(() => {
    limpiar?.()
    limpiar = null
    montado = false
    mqlPuntero?.removeEventListener('change', activar)
  })

  // Reacciona en vivo al cambio de prefers-reduced-motion (síncrono: sin esperar al siguiente tick).
  watch(reducido, () => {
    if (montado) activar()
  }, { flush: 'sync' })
}
