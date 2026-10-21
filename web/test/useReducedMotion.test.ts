import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useReducedMotion } from '../src/composables/useReducedMotion'

const CONSULTA = '(prefers-reduced-motion: reduce)'

/** matchMedia simulado con `change` disparable y registro de oyentes. */
function simularMatchMedia(inicial: boolean) {
  let coincide = inicial
  const oyentes = new Set<() => void>()
  const consultas: string[] = []
  vi.stubGlobal('matchMedia', (query: string) => {
    consultas.push(query)
    return {
      get matches() {
        return coincide
      },
      media: query,
      addEventListener: (_t: string, fn: () => void) => oyentes.add(fn),
      removeEventListener: (_t: string, fn: () => void) => oyentes.delete(fn),
    }
  })
  return {
    oyentes,
    consultas,
    cambiar(valor: boolean) {
      coincide = valor
      for (const fn of [...oyentes]) fn()
    },
  }
}

describe('useReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refleja el valor inicial de la media query', () => {
    const mm = simularMatchMedia(true)
    const scope = effectScope()
    const reducido = scope.run(() => useReducedMotion())
    expect(mm.consultas).toContain(CONSULTA)
    expect(reducido?.value).toBe(true)
    scope.stop()
  })

  it('se actualiza en vivo con el evento change', () => {
    const mm = simularMatchMedia(false)
    const scope = effectScope()
    const reducido = scope.run(() => useReducedMotion())
    expect(reducido?.value).toBe(false)
    mm.cambiar(true)
    expect(reducido?.value).toBe(true)
    mm.cambiar(false)
    expect(reducido?.value).toBe(false)
    scope.stop()
  })

  it('retira el listener al detener el scope', () => {
    const mm = simularMatchMedia(false)
    const scope = effectScope()
    scope.run(() => useReducedMotion())
    expect(mm.oyentes.size).toBe(1)
    scope.stop()
    expect(mm.oyentes.size).toBe(0)
  })

  it('sin matchMedia (SSR / entorno mínimo) devuelve false sin fallar', () => {
    vi.stubGlobal('matchMedia', undefined)
    const scope = effectScope()
    const reducido = scope.run(() => useReducedMotion())
    expect(reducido?.value).toBe(false)
    scope.stop()
  })
})
