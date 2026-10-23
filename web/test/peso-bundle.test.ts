// @vitest-environment node
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- script .mjs sin tipos
import { assetsIniciales } from '../scripts/peso-bundle.mjs'

describe('assetsIniciales', () => {
  it('extrae los JS y CSS que el HTML carga de entrada (script, modulepreload, stylesheet) bajo la subruta', () => {
    const html = `<!doctype html><html><head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka" />
      <script type="module" crossorigin src="/bigDay-encuesta/assets/resultados-AbCd1234.js"></script>
      <link rel="modulepreload" crossorigin href="/bigDay-encuesta/assets/vue-Xy12Ab34.js">
      <link rel="stylesheet" crossorigin href="/bigDay-encuesta/assets/resultados-Zz99Yy88.css">
      <link rel="icon" href="/bigDay-encuesta/img/logo.png">
    </head></html>`
    expect(assetsIniciales(html)).toEqual(['resultados-AbCd1234.js', 'vue-Xy12Ab34.js', 'resultados-Zz99Yy88.css'])
  })

  it('sin assets locales → lista vacía', () => {
    expect(assetsIniciales('<html></html>')).toEqual([])
  })
})
