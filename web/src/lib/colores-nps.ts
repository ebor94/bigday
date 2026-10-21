// Colores de los botones del NPS (1–10): gradiente rojo → ámbar → verde en tonos claros
// para que el número, en tinta, cumpla AA como texto normal (≥ 4,5:1). Verificado en
// test/colores-nps.test.ts y con axe en e2e.

export const TEXTO_NPS = '#1E2A2E' // --c-ink

export const COLORES_NPS: readonly string[] = [
  '#F59A92', // 1
  '#F7AA8C', // 2
  '#F8BA86', // 3
  '#F8C97F', // 4
  '#F5D67A', // 5
  '#E2DA7C', // 6
  '#C9D982', // 7
  '#ADD48A', // 8
  '#93CD94', // 9
  '#7EC79F', // 10
]

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

/** Razón de contraste WCAG 2.x entre dos colores `#RRGGBB`. */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number]
  return (l1 + 0.05) / (l2 + 0.05)
}
