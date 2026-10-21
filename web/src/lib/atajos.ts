// Atajos de teclado de la encuesta (spec §5): A–D / 1–5 eligen opción, 1–9 y 0 (=10) en la
// escala, Enter continúa y Escape vuelve atrás (dentro de un campo de texto solo suelta el foco). Función pura: la UI traduce el evento a
// `TeclaInfo` y ejecuta la acción devuelta.

export interface TeclaInfo {
  key: string
  /** El foco está en un campo donde se escribe (input de texto, textarea, contenteditable). */
  enCampoTexto: boolean
  /** El foco está en un botón o enlace: Enter lo activa el navegador. */
  enBoton: boolean
  shift?: boolean
  /** Ctrl, Cmd o Alt pulsados: son atajos del navegador, no nuestros. */
  modificador: boolean
}

export type ContextoTeclado =
  | { tipo: 'single'; opciones: number }
  | { tipo: 'scale'; min: number; max: number }
  | { tipo: 'open' }

export type AccionTecla =
  | { tipo: 'elegir'; indice: number }
  | { tipo: 'valor'; valor: number }
  | { tipo: 'continuar' }
  | { tipo: 'atras' }
  /** Escape dentro de un campo de texto: solo se suelta el foco (no se pierde lo escrito ni se navega). */
  | { tipo: 'soltarFoco' }
  | null

export function accionTecla(t: TeclaInfo, ctx: ContextoTeclado): AccionTecla {
  if (t.modificador) return null
  if (t.key === 'Escape') return t.enCampoTexto ? { tipo: 'soltarFoco' } : { tipo: 'atras' }
  if (t.key === 'Enter') {
    if (t.enBoton) return null
    if (t.enCampoTexto && t.shift) return null
    return { tipo: 'continuar' }
  }
  if (t.enCampoTexto || t.key.length !== 1) return null

  if (ctx.tipo === 'single') {
    const letra = t.key.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0)
    if (letra >= 0 && letra < Math.min(ctx.opciones, 26)) return { tipo: 'elegir', indice: letra }
    if (/^[1-9]$/.test(t.key)) {
      const indice = Number(t.key) - 1
      return indice < ctx.opciones ? { tipo: 'elegir', indice } : null
    }
    return null
  }

  if (ctx.tipo === 'scale' && /^[0-9]$/.test(t.key)) {
    const valor = t.key === '0' ? 10 : Number(t.key)
    return valor >= ctx.min && valor <= ctx.max ? { tipo: 'valor', valor } : null
  }
  return null
}

const TIPOS_SIN_TEXTO = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'])

/** ¿El elemento es un campo donde el usuario escribe? */
export function esCampoTexto(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) return !TIPOS_SIN_TEXTO.has(el.type)
  return (el as HTMLElement).isContentEditable === true || el.getAttribute('contenteditable') === 'true'
}

/** ¿El elemento se activa con Enter de forma nativa? */
export function esBoton(el: Element | null): boolean {
  return !!el && (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement)
}

/** Traduce un KeyboardEvent a `TeclaInfo`. */
export function teclaDe(e: KeyboardEvent): TeclaInfo {
  const objetivo = e.target instanceof Element ? e.target : null
  return {
    key: e.key,
    enCampoTexto: esCampoTexto(objetivo),
    enBoton: esBoton(objetivo),
    shift: e.shiftKey,
    modificador: e.ctrlKey || e.metaKey || e.altKey,
  }
}
