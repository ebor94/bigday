import { getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue'

// Preferencia del sistema `prefers-reduced-motion: reduce` como ref reactiva.
// - Se actualiza en vivo con el evento `change` de la media query.
// - Seguro sin `matchMedia` (SSR / entornos mínimos): devuelve `false`.
// - Si se usa dentro de un scope (componente o effectScope) retira el listener al cerrarse.

export const CONSULTA_REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export function useReducedMotion(): Readonly<Ref<boolean>> {
  const reducido = ref(false)
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return readonly(reducido)
  }

  const mql = window.matchMedia(CONSULTA_REDUCED_MOTION)
  reducido.value = mql.matches
  const alCambiar = () => {
    reducido.value = mql.matches
  }
  mql.addEventListener('change', alCambiar)

  if (getCurrentScope()) {
    onScopeDispose(() => mql.removeEventListener('change', alCambiar))
  }
  return readonly(reducido)
}
