import AxeBuilder from '@axe-core/playwright'
import { QUESTIONS } from '@bigday/shared'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Flujo completo de la encuesta con la API simulada (page.route):
// bienvenida → P1…P7 → gracias, con clic y con atajos de teclado, "Otro" con texto,
// validación, Atrás/Escape, sin scroll horizontal en cada pantalla y contraste AA (axe).
// El reloj de Playwright controla el avance automático (600 ms), las transiciones GSAP
// y el cronómetro de la encuesta (duracion_seg ≥ 8).
const DIR = resolve(process.env.CAPTURAS_DIR ?? 'test-results/capturas')
const PREFIJO = process.env.CAPTURAS_PREFIJO ?? 'flujo'
mkdirSync(DIR, { recursive: true })

const titulo = (i: number) => QUESTIONS[i]!.title
/** Avance automático (600 ms) + salida y entrada de la transición, con margen. */
const PASO_MS = 1_500

const VISTAS = [
  { nombre: '320', width: 320, height: 640, capturas: false },
  { nombre: '375', width: 375, height: 812, capturas: true },
  { nombre: '1440', width: 1440, height: 900, capturas: true },
] as const

async function simularApi(page: Page, estado = 201, cuerpo: object = { ok: true }) {
  const enviados: unknown[] = []
  await page.route('**/api/bigday/v1/respuestas', async (route) => {
    enviados.push(route.request().postDataJSON())
    await route.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify(cuerpo) })
  })
  return enviados
}

async function abrir(page: Page, vista: { width: number; height: number }, tituloEsperado = 'October') {
  await page.clock.install()
  await page.setViewportSize(vista)
  await page.goto('/')
  // Reloj detenido: temporizadores (ambiente, avance automático) y GSAP solo avanzan con runFor.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(tituloEsperado)
  // La llegada del mosquero (animación CSS, tiempo real) termina antes de medir o capturar.
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('.hero__ave')].flatMap((el) => el.getAnimations().map((a) => a.finished)),
    ),
  )
}

async function sinScrollHorizontal(page: Page, pantalla: string) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(m.scrollWidth, `${pantalla}: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.innerWidth)
}

/** Contraste AA: pasada normal y pasada estricta sin capas decorativas (todo debe medirse). */
async function contrasteAA(page: Page, pantalla: string) {
  // axe usa temporizadores: el reloj corre mientras mide (no debe haber avance automático pendiente).
  await page.clock.resume()
  const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  expect(axe.violations, `${pantalla}: ${JSON.stringify(axe.violations, null, 2)}`).toEqual([])
  const estilo = await page.addStyleTag({
    content: '.acuarela,.aves,.plumas{display:none!important} body{background-image:none!important}',
  })
  const estricto = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  await estilo.evaluate((el) => (el as Element).remove())
  expect(estricto.violations, `${pantalla} (estricto): ${JSON.stringify(estricto.violations, null, 2)}`).toEqual([])
  expect(
    estricto.incomplete.flatMap((r) => r.nodes.map((n) => `${n.target.join(' ')} → ${n.any.map((c) => c.message).join('; ')}`)),
    `${pantalla}: nodos sin medir`,
  ).toEqual([])
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50)
}

/** Distancia (px) entre el centro del ave posada y el punto sobre el borde superior del botón. */
function centroAveSobre(page: Page, boton: Locator) {
  return async () => {
    const ave = await page.locator('.ave--perched').boundingBox()
    const caja = await boton.boundingBox()
    if (!ave || !caja) return Infinity
    return Math.max(
      Math.abs(ave.x + ave.width / 2 - (caja.x + caja.width / 2)),
      Math.abs(ave.y + ave.height / 2 - (caja.y - 10)),
    )
  }
}

async function enPregunta(page: Page, i: number) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(titulo(i))
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i + 1))
}

/** Revisa cada pantalla: sin scroll horizontal y, si corresponde, contraste y captura. */
async function revisar(page: Page, vista: (typeof VISTAS)[number], pantalla: string, opciones: { axe?: boolean } = {}) {
  await sinScrollHorizontal(page, pantalla)
  if (opciones.axe && vista.nombre !== '320') await contrasteAA(page, pantalla)
  if (vista.capturas) await page.screenshot({ path: join(DIR, `${PREFIJO}-${vista.nombre}-${pantalla}.png`) })
}

for (const vista of VISTAS) {
  test(`flujo completo a ${vista.nombre} px: clic, teclado, "Otro" y envío solo con códigos`, async ({ page }) => {
    const enviados = await simularApi(page)
    await abrir(page, vista)
    await revisar(page, vista, 'bienvenida', { axe: true })
    await expect(page.getByText('Tus respuestas son anónimas y se usarán solo para mejorar nuestros espacios.')).toBeVisible()

    await page.getByRole('button', { name: 'Comenzar' }).click()
    await page.clock.runFor(PASO_MS)

    // P1 con clic: avance automático a los 600 ms.
    await enPregunta(page, 0)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await revisar(page, vista, 'p1', { axe: true })
    await page.getByRole('radio', { name: /Sabía que había aves y otros animales/ }).click()
    await expect(page.getByRole('radio', { name: /Sabía que había aves y otros animales/ })).toHaveAttribute('aria-checked', 'true')
    await page.clock.runFor(PASO_MS)

    // P2 con teclado (C = tercera opción). Escape vuelve a P1 con la respuesta guardada.
    await enPregunta(page, 1)
    await page.keyboard.press('Escape')
    await page.clock.runFor(PASO_MS)
    await enPregunta(page, 0)
    await expect(page.getByRole('radio', { checked: true })).toHaveAttribute('data-codigo', 'B')
    await page.keyboard.press('Enter')
    await page.clock.runFor(PASO_MS)
    await enPregunta(page, 1)
    await page.keyboard.press('c')
    await page.clock.runFor(PASO_MS)

    // P3 con "Otro": no avanza solo; exige texto y "Continuar".
    await enPregunta(page, 2)
    await page.getByRole('radio', { name: 'Otro' }).click()
    await page.clock.runFor(PASO_MS)
    await enPregunta(page, 2)
    const campo = page.getByRole('textbox', { name: 'Escribe tu respuesta' })
    await expect(campo).toBeFocused()
    await expect(campo).toHaveAttribute('maxlength', '120')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('alert')).toHaveText('Escribe tu respuesta en "Otro".')
    await campo.fill('Un aula viva')
    await expect(page.getByText('12 / 120')).toBeVisible()
    await revisar(page, vista, 'p3-otro', { axe: true })
    await campo.press('Enter')
    await page.clock.runFor(PASO_MS)

    // P4 con número (2 = segunda opción) y P5 con clic.
    await enPregunta(page, 3)
    await page.keyboard.press('2')
    await page.clock.runFor(PASO_MS)
    await enPregunta(page, 4)
    await page.getByRole('radio').first().click()
    await page.clock.runFor(PASO_MS)

    // P6 (NPS): 0 = 10; el pajarito se posa sobre el número elegido.
    await enPregunta(page, 5)
    await expect(page.getByRole('radio')).toHaveCount(10)
    await expect(page.getByText('Nada probable')).toBeVisible()
    await expect(page.getByText('Muy probable')).toBeVisible()
    await page.keyboard.press('0')
    const diez = page.getByRole('radio', { name: '10' })
    await expect(diez).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('.ave--perched')).toHaveCount(1)
    await expect.poll(centroAveSobre(page, diez)).toBeLessThan(2)
    // Termina el aterrizaje del ave posada (WAAPI finito); las animaciones CSS infinitas siguen.
    // Avanza solo; al volver con Escape el ave se posa de nuevo sobre el 10 (tras la transición).
    await page.clock.runFor(PASO_MS)
    await enPregunta(page, 6)
    await page.keyboard.press('Escape')
    await page.clock.runFor(PASO_MS)
    await enPregunta(page, 5)
    await expect(page.locator('.ave--perched')).toHaveCount(1)
    await expect.poll(centroAveSobre(page, diez)).toBeLessThan(2)
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => {
        if (Number.isFinite(Number(a.effect?.getComputedTiming().endTime))) a.finish()
      }),
    )
    await revisar(page, vista, 'nps', { axe: true })
    await page.keyboard.press('Enter')
    await page.clock.runFor(PASO_MS)

    // P7: validación de mínimo y envío.
    await enPregunta(page, 6)
    await expect(page.locator('.ave--perched')).toHaveCount(0)
    const texto = page.getByRole('textbox')
    await expect(texto).toHaveAttribute('placeholder', 'Ej.: Ven a ver aves increíbles en un lugar lleno de vida')
    await page.getByRole('button', { name: 'Enviar' }).click()
    await expect(page.getByRole('alert')).toHaveText('Escribe entre 10 y 280 caracteres.')
    await texto.fill('Ven a conocer las aves de Los Olivos')
    await revisar(page, vista, 'p7', { axe: true })
    await page.getByRole('button', { name: 'Enviar' }).click()
    await page.clock.runFor(PASO_MS)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Gracias!')
    await expect(page.getByRole('status')).toContainText('Recibimos tu respuesta')
    await expect(page.getByRole('button', { name: 'Compartir el evento' })).toBeVisible()
    await revisar(page, vista, 'gracias', { axe: true })

    expect(enviados).toHaveLength(1)
    const cuerpo = enviados[0] as Record<string, unknown>
    expect(cuerpo).toMatchObject({
      p1: 'B',
      p2: 'ambas',
      p3: 'otro',
      p3_otro: 'Un aula viva',
      p4: 'cientifico',
      p5: 'A',
      p6: 10,
      p7: 'Ven a conocer las aves de Los Olivos',
      website: '',
    })
    expect(cuerpo.duracion_seg as number).toBeGreaterThanOrEqual(8)
    expect(Object.keys(cuerpo).sort()).toEqual(
      ['duracion_seg', 'p1', 'p2', 'p3', 'p3_otro', 'p4', 'p5', 'p6', 'p7', 'uuid', 'website'].sort(),
    )
    // Solo códigos: ningún texto de opción viaja al servidor.
    const etiquetas: string[] = QUESTIONS.flatMap((q) => (q.type === 'single' ? q.options.map((o) => o.label) : []))
    const valores = Object.values(cuerpo).map(String)
    expect(valores.filter((v) => etiquetas.includes(v))).toEqual([])
  })
}

test('al volver tras responder muestra "ya respondiste" y permite responder de nuevo', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bigday:respondida', '2026-10-17T12:00:00.000Z'))
  await abrir(page, { width: 375, height: 812 }, 'ya respondiste')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Gracias, ya respondiste!')
  await sinScrollHorizontal(page, 'ya-respondiste')
  await page.getByRole('button', { name: 'Responder de nuevo' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('bigday:respondida'))).toBeNull()
})

test('sin conexión: guarda la respuesta y avisa que se enviará sola', async ({ page }) => {
  await page.route('**/api/bigday/v1/respuestas', (route) => route.abort('internetdisconnected'))
  await abrir(page, { width: 375, height: 812 })
  await page.getByRole('button', { name: 'Comenzar' }).click()
  await page.clock.runFor(PASO_MS)
  for (const tecla of ['a', 'a', 'a', 'a', 'a', '7']) {
    await page.keyboard.press(tecla)
    await page.clock.runFor(PASO_MS)
  }
  await page.getByRole('textbox').fill('Un lugar lleno de vida')
  await page.keyboard.press('Enter')
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('status')).toContainText('se enviará automáticamente')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bigday:outbox') ?? '[]').length)).toBe(1)
})

test('rechazada por el servidor: muestra el mensaje y permite revisar sin perder respuestas', async ({ page }) => {
  await simularApi(page, 400, { error: 'Respuesta inválida' })
  await abrir(page, { width: 375, height: 812 })
  await page.getByRole('button', { name: 'Comenzar' }).click()
  await page.clock.runFor(PASO_MS)
  for (const tecla of ['b', 'b', 'b', 'b', 'b', '9']) {
    await page.keyboard.press(tecla)
    await page.clock.runFor(PASO_MS)
  }
  await page.getByRole('textbox').fill('Vale mucho la pena')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('status')).toHaveText('Respuesta inválida')
  await page.getByRole('button', { name: 'Revisar mis respuestas' }).click()
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 6)
  await expect(page.getByRole('textbox')).toHaveValue('Vale mucho la pena')
})

test.describe('con prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('bienvenida a 375 px sin animaciones de vuelo', async ({ page }) => {
    await abrir(page, { width: 375, height: 812 })
    const animacionHero = await page.locator('.hero__ave').evaluate((el) => getComputedStyle(el).animationName)
    expect(animacionHero).toBe('none')
    await sinScrollHorizontal(page, 'bienvenida-reduced')
    await page.screenshot({ path: join(DIR, `${PREFIJO}-375-bienvenida-reduced.png`) })
  })
})
