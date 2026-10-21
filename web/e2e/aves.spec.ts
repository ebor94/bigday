import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Aves animadas: rendimiento (solo transform/opacity, tope de 12), reduced-motion
// y capturas deterministas con una bandada a mitad de vuelo.
// Determinismo: Math.random con semilla fija y reloj de Playwright (los setTimeout del
// ambiente solo avanzan cuando la prueba lo pide). Las animaciones WAAPI se pausan en
// un currentTime fijo antes de capturar.
const DIR = resolve(process.env.CAPTURAS_DIR ?? 'test-results/capturas')
mkdirSync(DIR, { recursive: true })

const PROPIEDADES_PERMITIDAS = new Set(['offset', 'computedOffset', 'easing', 'composite', 'transform', 'opacity'])

async function preparar(page: Page, vista: { width: number; height: number }) {
  await page.addInitScript(() => {
    // mulberry32 con semilla fija: trayectorias idénticas en cada ejecución.
    let s = 20261017
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  })
  await page.clock.install()
  await page.setViewportSize(vista)
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // Registra el máximo de aves presentes en el DOM en cualquier momento.
  await page.evaluate(() => {
    const w = window as unknown as { __maxAves: number }
    w.__maxAves = document.querySelectorAll('.ave').length
    new MutationObserver(() => {
      w.__maxAves = Math.max(w.__maxAves, document.querySelectorAll('.ave').length)
    }).observe(document.body, { childList: true, subtree: true })
  })
}

/** Pausa todas las animaciones en un instante fijo (vuelos y aleteo). */
async function congelar(page: Page, msBandada: number, fraccionAmbiente: number) {
  await page.evaluate(
    ({ msBandada, fraccionAmbiente }) => {
      for (const anim of document.getAnimations()) {
        anim.pause()
        const objetivo = (anim.effect as KeyframeEffect | null)?.target as Element | null
        const tipo = objetivo?.closest<HTMLElement>('.ave')?.dataset.tipo
        const tiempo = anim.effect?.getComputedTiming()
        const retraso = Number(tiempo?.delay ?? 0)
        const duracion = Number(tiempo?.duration ?? 0)
        if (anim instanceof CSSAnimation) anim.currentTime = 0 // aleteo
        else if (tipo === 'flock') anim.currentTime = msBandada
        else if (tipo === 'ambient') anim.currentTime = retraso + duracion * fraccionAmbiente
        else anim.currentTime = retraso + duracion // posada: aterrizaje terminado
      }
    },
    { msBandada, fraccionAmbiente },
  )
}

async function sinScrollHorizontal(page: Page) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(m.scrollWidth, JSON.stringify(m)).toBeLessThanOrEqual(m.innerWidth)
}

test('las animaciones solo tocan transform/opacity y nunca hay más de 12 aves', async ({ page }) => {
  await preparar(page, { width: 375, height: 812 })
  // Ave posada en "Comenzar" y primera oleada ambiental.
  await expect(page.locator('.ave--perched')).toHaveCount(1)
  await page.clock.runFor(3_000)
  expect(await page.locator('.ave--ambient').count()).toBeGreaterThanOrEqual(2)

  const opciones = page.locator('.opcion')
  for (let i = 0; i < 6; i++) {
    await opciones.nth(i % (await opciones.count())).click()
    expect(await page.locator('.ave').count()).toBeLessThanOrEqual(12)
  }
  expect(await page.locator('.ave--flock').count()).toBeGreaterThanOrEqual(5)
  await sinScrollHorizontal(page)

  const informe = await page.evaluate(() => {
    const anims = document.getAnimations()
    return {
      vuelos: anims.filter((a) => a.constructor.name === 'Animation').length,
      propiedades: [
        ...new Set(anims.flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))),
      ],
    }
  })
  expect(informe.vuelos).toBeGreaterThanOrEqual(5)
  expect(informe.propiedades.filter((p) => !PROPIEDADES_PERMITIDAS.has(p)), informe.propiedades.join(', ')).toEqual([])

  const maximo = await page.evaluate(() => (window as unknown as { __maxAves: number }).__maxAves)
  expect(maximo).toBeLessThanOrEqual(12)
  test.info().annotations.push({ type: 'aves', description: `máximo en DOM: ${maximo}; propiedades: ${informe.propiedades.join(', ')}` })
})

test('el vuelo no provoca layout por frame (métricas CDP)', async ({ page }) => {
  await preparar(page, { width: 1440, height: 900 })
  await page.locator('.opcion').first().click()
  await expect(page.locator('.ave--flock')).toHaveCount(5)
  // Deja que se monten las aves y arranquen los vuelos (tiempo real: WAAPI no usa el reloj falso).
  await page.waitForTimeout(150)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const medir = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics')
    const valor = (n: string) => metrics.find((m) => m.name === n)?.value ?? 0
    return { layouts: valor('LayoutCount'), estilos: valor('RecalcStyleCount') }
  }
  const antes = await medir()
  await page.waitForTimeout(1_000) // ~60 frames de vuelo en tiempo real
  const despues = await medir()
  const delta = { layouts: despues.layouts - antes.layouts, estilos: despues.estilos - antes.estilos }
  test.info().annotations.push({ type: 'cdp', description: JSON.stringify(delta) })
  // Con ~60 frames, layout por frame daría decenas; solo composición da ~0.
  // Los recálculos de estilo esporádicos vienen del arranque escalonado de cada vuelo, no de cada frame.
  expect(delta.layouts, JSON.stringify(delta)).toBeLessThanOrEqual(3)
  expect(delta.estilos, JSON.stringify(delta)).toBeLessThan(30)
})

for (const vista of [
  { nombre: '375', width: 375, height: 812 },
  { nombre: '1440', width: 1440, height: 900 },
] as const) {
  test(`captura con bandada a mitad de vuelo a ${vista.nombre} px`, async ({ page }) => {
    await preparar(page, vista)
    await page.clock.runFor(3_000) // primera oleada ambiental
    await page.locator('.opcion').nth(1).click()
    await expect(page.locator('.ave--flock')).toHaveCount(5)
    await congelar(page, 700, 0.35)
    await sinScrollHorizontal(page)
    await page.screenshot({ path: join(DIR, `tarea7-${vista.nombre}-bandada.png`) })
  })
}

test.describe('con prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('no hay vuelos: ni ambiente ni bandada; el ave posada queda quieta', async ({ page }) => {
    await preparar(page, { width: 375, height: 812 })
    await page.clock.runFor(60_000)
    await page.locator('.opcion').first().click()
    await expect(page.locator('.ave--perched')).toHaveCount(1)
    expect(await page.locator('.ave--volando').count()).toBe(0)
    const vuelos = await page.evaluate(
      () => document.getAnimations().filter((a) => a.constructor.name === 'Animation').length,
    )
    expect(vuelos).toBe(0)
    const ala = await page.locator('.ave--perched .ave-sprite__ala').evaluate((el) => getComputedStyle(el).animationName)
    expect(ala).toBe('none')
    await sinScrollHorizontal(page)
    await page.locator('.boton-primario').scrollIntoViewIfNeeded()
    // El ave posada sigue al botón tras el scroll: su centro queda sobre el borde superior.
    await expect
      .poll(async () => {
        const ave = await page.locator('.ave--perched').boundingBox()
        const boton = await page.locator('.boton-primario').boundingBox()
        if (!ave || !boton) return Infinity
        return Math.abs(ave.y + ave.height / 2 - (boton.y - 10))
      })
      .toBeLessThan(2)
    await page.screenshot({ path: join(DIR, 'tarea7-375-reduced.png') })
  })
})
