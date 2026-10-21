import { expect, test } from '@playwright/test'
import { detenerReloj } from './utilidades'

// Verificación del build de producción servido bajo la subruta real (/bigDay-encuesta/):
// - los assets (JS, CSS, imágenes de public/) responden 200 bajo la subruta;
// - el logo carga;
// - el envío va a la API de producción y lleva origen 'qr-entrada' (leído de ?src=qr-entrada).
// La API se SIMULA con page.route: jamás se envía un POST real a producción.
const API_PRODUCCION = 'https://mantix-api.losolivoscucuta.com:8444/api/bigday/v1'
const SUBRUTA = '/bigDay-encuesta/'
const PASO_MS = 1_500

test('build de producción en la subruta: assets 200, logo cargado y POST a la API de producción con origen qr-entrada', async ({ page }) => {
  const fallos: string[] = []
  const recursos: string[] = []
  page.on('response', (r) => {
    const url = new URL(r.url())
    if (url.origin !== new URL(page.url() || 'http://localhost:4173').origin) return
    recursos.push(url.pathname)
    if (r.status() >= 400) fallos.push(`${r.status()} ${url.pathname}`)
  })

  const peticiones: { url: string; metodo: string; cuerpo: Record<string, unknown> }[] = []
  // Cualquier otra llamada a la API de producción también queda simulada. Va primero: Playwright
  // da prioridad a la ruta registrada más tarde.
  await page.route(`${API_PRODUCCION}/**`, (route) => route.fulfill({ status: 204 }))
  await page.route(`${API_PRODUCCION}/respuestas`, async (route) => {
    const req = route.request()
    peticiones.push({ url: req.url(), metodo: req.method(), cuerpo: req.postDataJSON() })
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ok: true }),
    })
  })

  await page.clock.install()
  await page.goto('./?src=qr-entrada')
  await detenerReloj(page)
  await expect(page).toHaveURL(new RegExp(`${SUBRUTA}\\?src=qr-entrada$`))
  await expect(page.getByRole('heading', { level: 1 })).toContainText('October')

  const logo = page.getByRole('img', { name: 'Los Olivos' })
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  expect(await logo.evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname)).toBe(`${SUBRUTA}img/logo-olivos.webp`)

  // Recorre el flujo: P1…P6 con atajos de teclado y P7 con texto.
  await page.getByRole('button', { name: 'Comenzar' }).click()
  await page.clock.runFor(PASO_MS)
  for (const [i, tecla] of ['a', 'a', 'a', 'a', 'a', '9'].entries()) {
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i + 1))
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await page.keyboard.press(tecla)
    await page.clock.runFor(PASO_MS)
  }
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.getByRole('textbox').fill('Prueba del build de producción')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('status')).toContainText('Recibimos tu respuesta')

  // Assets: todo bajo la subruta, todo 200, y hay JS, CSS e imagen.
  expect(fallos).toEqual([])
  expect(recursos.length).toBeGreaterThan(0)
  expect(recursos.every((p) => p.startsWith(SUBRUTA))).toBe(true)
  expect(recursos.some((p) => p.startsWith(`${SUBRUTA}assets/`) && p.endsWith('.js'))).toBe(true)
  expect(recursos.some((p) => p.startsWith(`${SUBRUTA}assets/`) && p.endsWith('.css'))).toBe(true)
  expect(recursos).toContain(`${SUBRUTA}img/logo-olivos.webp`)

  // Envío: un solo POST, a la API de producción, con origen del QR.
  expect(peticiones).toHaveLength(1)
  expect(peticiones[0]!.url).toBe(`${API_PRODUCCION}/respuestas`)
  expect(peticiones[0]!.metodo).toBe('POST')
  expect(peticiones[0]!.cuerpo).toMatchObject({ origen: 'qr-entrada', p6: 9 })
})
