import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Verificación visual de la identidad base (pantalla de bienvenida): capturas a 375 px y 1440 px,
// sin scroll horizontal y sin violaciones de contraste (axe).
// Las capturas van a CAPTURAS_DIR (por defecto test-results/capturas, ignorado por git).
const DIR = resolve(process.env.CAPTURAS_DIR ?? 'test-results/capturas')
const PREFIJO = process.env.CAPTURAS_PREFIJO ?? 'visual'
mkdirSync(DIR, { recursive: true })

const VISTAS = [
  { nombre: '320', width: 320, height: 640 },
  { nombre: '375', width: 375, height: 812 },
  { nombre: '1440', width: 1440, height: 900 },
] as const

async function prepararPagina(page: Page) {
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // El mosquero de la bienvenida llega volando (animación CSS en tiempo real): se espera a
  // que se pose para que no tape el texto mientras axe mide.
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('.hero__ave')].flatMap((el) => el.getAnimations().map((a) => a.finished)),
    ),
  )
}

async function sinScrollHorizontal(page: Page) {
  const medidas = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(medidas.scrollWidth, JSON.stringify(medidas)).toBeLessThanOrEqual(medidas.innerWidth)
}

for (const vista of VISTAS) {
  test(`identidad visual a ${vista.nombre} px`, async ({ page }) => {
    await page.setViewportSize({ width: vista.width, height: vista.height })
    await prepararPagina(page)
    await sinScrollHorizontal(page)

    const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([])

    await page.screenshot({ path: join(DIR, `${PREFIJO}-${vista.nombre}.png`), fullPage: true })

    // Sobre el fondo acuarela (SVG/imagen) axe no puede medir todo y deja nodos "incomplete".
    // Segunda pasada estricta: sin las capas decorativas (acuarela y aves, que con la capa
    // ambiental bajo el contenido pueden pasar detrás del texto), todo el texto debe medirse y aprobar.
    await page.addStyleTag({
      content: '.acuarela,.aves{display:none!important} body{background-image:none!important}',
    })
    const estricto = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(estricto.violations, JSON.stringify(estricto.violations, null, 2)).toEqual([])
    expect(
      estricto.incomplete.flatMap((r) => r.nodes.map((n) => n.target.join(' '))),
      'nodos sin medir',
    ).toEqual([])
  })
}

test.describe('con prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('375 px sin parallax', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await prepararPagina(page)
    // Scroll programático instantáneo (dispara eventos `scroll`); la rueda es suave y
    // asíncrona y seguía moviendo la página después de volver a 0.
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }))
    await page.waitForFunction(() => window.scrollY > 0)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const transformaciones = await page.$$eval('[data-profundidad]', (capas) =>
      capas.map((c) => getComputedStyle(c).transform),
    )
    expect(transformaciones.every((t) => t === 'none')).toBe(true)
    await sinScrollHorizontal(page)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    // Espera a que el scroll vuelva a 0 y a que se pinte un frame antes de capturar.
    await page.waitForFunction(() => window.scrollY === 0)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    await page.screenshot({ path: join(DIR, `${PREFIJO}-375-reduced.png`), fullPage: true })
  })
})
