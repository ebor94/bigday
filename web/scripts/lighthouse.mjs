// Auditoría Lighthouse móvil (spec §10): Performance ≥ 85 y Accesibilidad ≥ 95 (mediana de 3 corridas).
// 1. Compila (`npm run build`, salvo con --sin-build).
// 2. Sirve `dist` con gzip (scripts/servidor-estatico.mjs), como lo hará Apache en producción.
// 3. Lanza el Chromium de Playwright sin interfaz y corre Lighthouse con el preset móvil por defecto
//    (Moto G Power emulado, red 4G lenta y CPU 4× simuladas).
// 4. Guarda los informes JSON/HTML en LIGHTHOUSE_DIR (por defecto ../.git/sdd/lighthouse, fuera del repo).
// Uso: npm run lighthouse [-- --corridas=3 --sin-build]
import { chromium } from '@playwright/test'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { servir } from './servidor-estatico.mjs'

// Subruta de producción (debe coincidir con `base` de vite.config.ts).
const BASE = '/bigDay-encuesta/'
const MIN_PERFORMANCE = 85
const MIN_ACCESIBILIDAD = 95

const web = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const corridas = Number(args.find((a) => a.startsWith('--corridas='))?.split('=')[1] ?? 3)
const salida = resolve(process.env.LIGHTHOUSE_DIR ?? join(web, '../.git/sdd/lighthouse'))
mkdirSync(salida, { recursive: true })

if (!args.includes('--sin-build')) execSync('npm run build', { cwd: web, stdio: 'inherit' })

const mediana = (xs) => {
  const o = [...xs].sort((a, b) => a - b)
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2
}

const servidor = await servir(join(web, 'dist'), 0, BASE)
const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
})

const resultados = []
try {
  for (let i = 1; i <= corridas; i++) {
    const r = await lighthouse(servidor.url, {
      port: chrome.port,
      output: ['json', 'html'],
      onlyCategories: ['performance', 'accessibility'],
      logLevel: 'error',
    })
    if (!r) throw new Error('Lighthouse no devolvió resultados')
    const [json, html] = r.report
    writeFileSync(join(salida, `movil-${i}.json`), json)
    writeFileSync(join(salida, `movil-${i}.html`), html)
    const { categories: c, audits: a } = r.lhr
    const fila = {
      corrida: i,
      performance: Math.round(c.performance.score * 100),
      accesibilidad: Math.round(c.accessibility.score * 100),
      fcp: a['first-contentful-paint'].displayValue,
      lcp: a['largest-contentful-paint'].displayValue,
      tbt: a['total-blocking-time'].displayValue,
      cls: a['cumulative-layout-shift'].displayValue,
      si: a['speed-index'].displayValue,
    }
    resultados.push(fila)
    console.log(JSON.stringify(fila))
  }
} finally {
  chrome.kill()
  await servidor.cerrar()
}

const perf = mediana(resultados.map((r) => r.performance))
const acc = mediana(resultados.map((r) => r.accesibilidad))
const resumen = { fecha: new Date().toISOString(), corridas: resultados, mediana: { performance: perf, accesibilidad: acc } }
writeFileSync(join(salida, 'resumen.json'), JSON.stringify(resumen, null, 2))
const ok = perf >= MIN_PERFORMANCE && acc >= MIN_ACCESIBILIDAD
console.log(
  `Mediana de ${corridas}: Performance ${perf} (mín. ${MIN_PERFORMANCE}), Accesibilidad ${acc} (mín. ${MIN_ACCESIBILIDAD}) → ${ok ? 'OK' : 'NO CUMPLE'}`,
)
console.log(`Informes: ${salida}`)
process.exit(ok ? 0 : 1)
