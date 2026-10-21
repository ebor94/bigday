import AxeBuilder from '@axe-core/playwright'
import { QUESTIONS } from '@bigday/shared'
import { type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from './fixtures'
import { detenerReloj, PROYECTO_ANCHOS, soloEnProyectoDeAnchos, sufijoProyecto } from './utilidades'

// Flujo completo de la encuesta con la API simulada (page.route):
// bienvenida → P1…P7 → gracias, con clic y con atajos de teclado, "Otro" con texto,
// validación, Atrás/Escape, sin scroll horizontal en cada pantalla y contraste AA (axe).
// El reloj de Playwright controla el avance automático (600 ms), las transiciones GSAP
// y el cronómetro de la encuesta (duracion_seg ≥ 8).
// Proyectos: todo corre en Pixel 7, iPhone 13 (WebKit) y Desktop Chrome, salvo el flujo a anchos
// fijos 320/375/1440 px con capturas, que corre solo en Desktop Chrome (ver utilidades.ts).
// Casos de la Tarea 10 (cada uno es una prueba con nombre propio): flujo completo feliz,
// "Otro" en P3 y P4, P7 corta, API caída + reintento al recargar, reduced-motion, segunda visita.
const DIR = resolve(process.env.CAPTURAS_DIR ?? 'test-results/capturas')
const PREFIJO = process.env.CAPTURAS_PREFIJO ?? 'flujo'
mkdirSync(DIR, { recursive: true })

const titulo = (i: number) => QUESTIONS[i]!.title
/** Avance automático (600 ms) + salida y entrada de la transición, con margen. */
const PASO_MS = 1_500

interface Vista {
  nombre: string
  /** Sin tamaño: se usa el viewport del dispositivo del proyecto. */
  width?: number
  height?: number
  capturas: boolean
}

const VISTAS: readonly Vista[] = [
  { nombre: '320', width: 320, height: 640, capturas: false },
  { nombre: '375', width: 375, height: 812, capturas: true },
  { nombre: '1440', width: 1440, height: 900, capturas: true },
]

async function simularApi(page: Page, estado = 201, cuerpo: object = { ok: true }) {
  const enviados: unknown[] = []
  await page.route('**/api/bigday/v1/respuestas', async (route) => {
    enviados.push(route.request().postDataJSON())
    await route.fulfill({
      status: estado,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, // la API de producción es de otro origen
      body: JSON.stringify(cuerpo),
    })
  })
  return enviados
}

async function abrir(page: Page, vista: { width?: number; height?: number } = {}, tituloEsperado = 'October') {
  await page.clock.install()
  if (vista.width && vista.height) await page.setViewportSize({ width: vista.width, height: vista.height })
  await page.goto('./')
  // Reloj detenido: temporizadores (ambiente, avance automático) y GSAP solo avanzan con runFor.
  await detenerReloj(page)
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
  await detenerReloj(page)
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

/**
 * Pregunta i ya estable: el h1 nuevo recibe el foco al terminar la transición de entrada
 * (`trasEntrar`), que es cuando la app vuelve a aceptar teclas (`estable`). Comprobarlo antes
 * de pulsar evita depender de que el `runFor` anterior haya bastado para cerrar la transición.
 */
async function enPreguntaEstable(page: Page, i: number) {
  await enPregunta(page, i)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
}

/** Revisa cada pantalla: sin scroll horizontal y, si corresponde, contraste y captura. */
async function revisar(page: Page, vista: Vista, pantalla: string, opciones: { axe?: boolean } = {}) {
  await sinScrollHorizontal(page, pantalla)
  if (opciones.axe && vista.nombre !== '320') await contrasteAA(page, pantalla)
  if (vista.capturas) await page.screenshot({ path: join(DIR, `${PREFIJO}-${vista.nombre}-${pantalla}.png`) })
}

/** Flujo completo feliz: clic, teclado, "Otro" y envío solo con códigos. */
async function flujoFeliz(page: Page, vista: Vista) {
  const enviados = await simularApi(page)
  await abrir(page, vista)
  await revisar(page, vista, 'bienvenida', { axe: true })
  await expect(page.getByText('Tus respuestas son anónimas y se usarán solo para mejorar nuestros espacios.')).toBeVisible()
  const logo = page.getByRole('img', { name: 'Los Olivos' })
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)

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
  // Escape dentro del campo solo suelta el foco: no vuelve a P2 ni borra el texto.
  await campo.press('Escape')
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 2)
  await expect(campo).not.toBeFocused()
  await expect(campo).toHaveValue('Un aula viva')
  await campo.focus()
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
  // Shift+Enter inserta salto de línea; Escape en el textarea no navega.
  await texto.fill('Primera')
  await texto.press('Shift+Enter')
  await texto.press('Escape')
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 6)
  await expect(texto).toHaveValue('Primera\n')
  await texto.fill('Ven a conocer las aves de Los Olivos')
  await revisar(page, vista, 'p7', { axe: true })
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Gracias!')
  await expect(page.getByRole('status')).toContainText('Recibimos tu respuesta')
  await expect(page.getByText('¡Así vivimos el 2.º October Big Day Los Olivos!')).toBeVisible()
  await expect(page.getByText('Te invitamos a ver el video del evento en nuestras redes sociales:')).toBeVisible()
  for (const { nombre, url } of [
    { nombre: 'Instagram', url: 'https://www.instagram.com/p/DesSPEXihbx/' },
    { nombre: 'Facebook', url: 'https://www.facebook.com/share/v/19ie8bWh3q/' },
  ]) {
    const enlace = page.getByRole('link', { name: url })
    await expect(enlace).toHaveAttribute('href', url)
    await expect(enlace).toHaveAttribute('target', '_blank')
    await expect(enlace).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(page.getByText(`${nombre}:`)).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Compartir el evento' })).toHaveCount(0)
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
}

test('flujo completo feliz en el viewport del dispositivo', async ({ page }) => {
  test.slow() // ~10 pasadas de axe; WebKit es más lento
  await flujoFeliz(page, { nombre: sufijoProyecto(), capturas: true })
})

for (const vista of VISTAS) {
  test(`flujo completo feliz a ${vista.nombre} px: clic, teclado, "Otro" y envío solo con códigos`, async ({ page }) => {
    soloEnProyectoDeAnchos()
    test.slow()
    await flujoFeliz(page, vista)
  })
}

test('320 px sin scroll horizontal en todos los proyectos (incluido WebKit): bienvenida, "Otro", NPS y P7', async ({ page }) => {
  // Spec §10: ancho mínimo 320 px y Safari iOS 15+. El flujo a 320 px con capturas corre solo en
  // Desktop Chrome; esta comprobación, sin axe ni capturas, corre también en iPhone 13 (WebKit).
  const vista = { width: 320, height: 640 }
  // En móvil emulado (isMobile) un desborde puede ensanchar el viewport de layout en vez de dar
  // scroll: además de scrollWidth ≤ innerWidth se exige que innerWidth siga siendo 320.
  const sin320 = async (pantalla: string) => {
    await sinScrollHorizontal(page, pantalla)
    expect(await page.evaluate(() => window.innerWidth), `${pantalla}: innerWidth`).toBe(320)
  }
  await simularApi(page)
  await abrir(page, vista)
  await sin320('320-bienvenida')
  await page.getByRole('button', { name: 'Comenzar' }).click()
  await page.clock.runFor(PASO_MS)
  for (const [i, tecla] of ['a', 'a'].entries()) {
    await enPreguntaEstable(page, i)
    await sin320(`320-p${i + 1}`)
    await page.keyboard.press(tecla)
    await page.clock.runFor(PASO_MS)
  }
  // P3 con "Otro" abierto y texto largo (120 caracteres, el máximo).
  await enPreguntaEstable(page, 2)
  await page.getByRole('radio', { name: 'Otro' }).click()
  const campo = page.getByRole('textbox', { name: 'Escribe tu respuesta' })
  await campo.fill('Un aula viva para aprender de aves '.repeat(4).slice(0, 120))
  await expect(page.getByText('120 / 120')).toBeVisible()
  await sin320('320-p3-otro')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.clock.runFor(PASO_MS)
  for (const i of [3, 4]) {
    await enPreguntaEstable(page, i)
    await page.keyboard.press('a')
    await page.clock.runFor(PASO_MS)
  }
  // NPS: antes de elegir y con el ave posada sobre el 10 (el número del borde derecho).
  await enPreguntaEstable(page, 5)
  await sin320('320-nps')
  await page.keyboard.press('0')
  await expect(page.locator('.ave--perched')).toHaveCount(1)
  await sin320('320-nps-posada')
  await page.clock.runFor(PASO_MS)
  await enPreguntaEstable(page, 6)
  await page.getByRole('textbox').fill('Ven a conocer las aves de Los Olivos, un lugar lleno de vida y de memoria.')
  await sin320('320-p7')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Gracias!')
  await sin320('320-gracias')
})

/** Bienvenida → P1…P6 con atajos de teclado (una tecla por pregunta). Queda en P7. */
async function hastaP7(page: Page, teclas: readonly string[] = ['a', 'a', 'a', 'a', 'a', '7']) {
  await page.getByRole('button', { name: 'Comenzar' }).click()
  await page.clock.runFor(PASO_MS)
  for (const [i, tecla] of teclas.entries()) {
    await enPreguntaEstable(page, i)
    await page.keyboard.press(tecla)
    await page.clock.runFor(PASO_MS)
  }
  await enPreguntaEstable(page, 6)
}

test('"Otro" en P3 y P4: envía el código "otro" y el texto en p3_otro y p4_otro', async ({ page }) => {
  const enviados = await simularApi(page)
  await abrir(page)
  await page.getByRole('button', { name: 'Comenzar' }).click()
  await page.clock.runFor(PASO_MS)
  for (const [i, tecla] of ['a', 'b'].entries()) {
    await enPreguntaEstable(page, i)
    await page.keyboard.press(tecla)
    await page.clock.runFor(PASO_MS)
  }
  for (const [i, texto] of [
    [2, 'Un aula viva'],
    [3, 'Fotógrafo de aves'],
  ] as const) {
    await enPreguntaEstable(page, i)
    await page.getByRole('radio', { name: 'Otro' }).click()
    await page.clock.runFor(PASO_MS)
    await enPregunta(page, i) // con "Otro" no avanza solo
    const campo = page.getByRole('textbox', { name: 'Escribe tu respuesta' })
    await expect(campo).toBeFocused()
    await campo.fill(`  ${texto}  `) // se recorta al enviar
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.clock.runFor(PASO_MS)
  }
  await enPreguntaEstable(page, 4)
  await page.keyboard.press('a')
  await page.clock.runFor(PASO_MS)
  await enPreguntaEstable(page, 5)
  await page.keyboard.press('9')
  await page.clock.runFor(PASO_MS)
  await enPreguntaEstable(page, 6)
  await page.getByRole('textbox').fill('Un lugar lleno de vida')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('status')).toContainText('Recibimos tu respuesta')

  expect(enviados).toHaveLength(1)
  expect(enviados[0]).toMatchObject({
    p1: 'A',
    p2: 'naturaleza',
    p3: 'otro',
    p3_otro: 'Un aula viva',
    p4: 'otro',
    p4_otro: 'Fotógrafo de aves',
    p5: 'A',
    p6: 9,
  })
})

test('P7 demasiado corta (9 caracteres tras recortar): no se envía y avisa en una región aria-live', async ({ page }) => {
  const enviados = await simularApi(page)
  await abrir(page)
  await hastaP7(page)
  const texto = page.getByRole('textbox')
  await texto.fill('   Muy bonit   ') // 9 caracteres tras recortar los espacios
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  const aviso = page.getByRole('alert')
  await expect(aviso).toHaveText('Escribe entre 10 y 280 caracteres.')
  await expect(aviso).toHaveAttribute('aria-live', 'assertive')
  await enPregunta(page, 6)
  // Enter tampoco envía.
  await texto.press('Enter')
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 6)
  expect(enviados).toHaveLength(0)
  // Con 10 caracteres sí se envía (límite exacto).
  await texto.fill('   Muy bonito   ')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Gracias!')
  expect(enviados).toHaveLength(1)
  expect((enviados[0] as Record<string, unknown>).p7).toBe('Muy bonito')
})

test('API caída: mensaje amable; al recargar con la API de vuelta reintenta el mismo envío y muestra "ya respondiste"', async ({ page }) => {
  // 1) API caída: el POST falla por red; la respuesta queda en la bandeja.
  const intentos: Record<string, unknown>[] = []
  await page.route('**/api/bigday/v1/respuestas', async (route) => {
    intentos.push(route.request().postDataJSON())
    await route.abort('internetdisconnected')
  })
  await abrir(page)
  await hastaP7(page)
  await page.getByRole('textbox').fill('Un lugar lleno de vida')
  await page.keyboard.press('Enter')
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Gracias!')
  await expect(page.getByRole('status')).toContainText('se enviará automáticamente')
  await expect(page.getByRole('status')).toContainText('No se pierde nada.')
  expect(intentos).toHaveLength(1)
  const bandeja = await page.evaluate(() => JSON.parse(localStorage.getItem('bigday:outbox') ?? '[]'))
  expect(bandeja).toHaveLength(1)
  expect(await page.evaluate(() => localStorage.getItem('bigday:respondida'))).toBeNull()

  // 2) La API vuelve: al recargar se reintenta solo, con exactamente el mismo cuerpo.
  await page.unroute('**/api/bigday/v1/respuestas')
  const reintentos = await simularApi(page)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Gracias, ya respondiste!')
  await expect(page.getByRole('status')).toHaveText('Tu respuesta ya está con nosotros.')
  await expect(page.getByRole('button', { name: 'Responder de nuevo' })).toBeVisible()
  expect(reintentos).toHaveLength(1)
  expect(reintentos[0]).toEqual(intentos[0]) // mismo uuid, mismo duracion_seg, mismas respuestas
  const original = intentos[0]!
  expect(original.uuid).toBe(bandeja[0].uuid)
  expect(original.duracion_seg as number).toBeGreaterThanOrEqual(8)
  expect(await page.evaluate(() => localStorage.getItem('bigday:outbox'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('bigday:respondida'))).not.toBeNull()
})

test('API caída con la página abierta: reintenta sola a los 15 s y pasa a "Recibimos tu respuesta"', async ({ page }) => {
  await page.route('**/api/bigday/v1/respuestas', (route) => route.abort('internetdisconnected'))
  await abrir(page)
  await hastaP7(page)
  await page.getByRole('textbox').fill('Un lugar lleno de vida')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('status')).toContainText('se enviará automáticamente')
  await page.unroute('**/api/bigday/v1/respuestas')
  const reintentos = await simularApi(page)
  await page.clock.runFor(15_000)
  await expect(page.getByRole('status')).toContainText('Recibimos tu respuesta')
  expect(reintentos).toHaveLength(1)
  expect(await page.evaluate(() => localStorage.getItem('bigday:outbox'))).toBeNull()
})

test('el evento "online" reenvía enseguida lo pendiente', async ({ page }) => {
  await page.route('**/api/bigday/v1/respuestas', (route) => route.abort('internetdisconnected'))
  await abrir(page)
  await hastaP7(page)
  await page.getByRole('textbox').fill('Un lugar lleno de vida')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('status')).toContainText('se enviará automáticamente')
  await page.unroute('**/api/bigday/v1/respuestas')
  const reintentos = await simularApi(page)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('status')).toContainText('Recibimos tu respuesta')
  expect(reintentos).toHaveLength(1)
})

test('un 404 de la infraestructura (redespliegue, URL mal puesta) no borra la respuesta: queda pendiente', async ({ page }) => {
  const enviados = await simularApi(page, 404, { error: 'Not Found' })
  await abrir(page)
  await hastaP7(page)
  await page.getByRole('textbox').fill('Un lugar lleno de vida')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('status')).toContainText('No se pierde nada.')
  expect(enviados).toHaveLength(1)
  const bandeja = await page.evaluate(() => JSON.parse(localStorage.getItem('bigday:outbox') ?? '[]'))
  expect(bandeja).toHaveLength(1)
})

test('al volver, si la respuesta guardada se rechaza (400) al reintentar: no dice "ya respondiste" y deja responder', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('sembrado')) return
    sessionStorage.setItem('sembrado', '1')
    localStorage.setItem(
      'bigday:outbox',
      JSON.stringify([{ uuid: '33333333-3333-4333-8333-333333333333', p1: 'A', p2: 'ambas', p3: 'memoria', p4: 'diversidad', p5: 'B', p6: 9, p7: 'xx', duracion_seg: 40 }]),
    )
  })
  const enviados = await simularApi(page, 400, { error: 'Datos inválidos.' })
  await abrir(page, {}, '')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No pudimos registrar tu respuesta')
  await expect(page.getByRole('status')).toContainText('No pudimos registrar tu respuesta anterior')
  await expect(page.getByRole('status')).not.toContainText('ya está con nosotros')
  await expect(page.locator('.gracias__video')).toHaveCount(0)
  expect(enviados).toHaveLength(1)
  if (test.info().project.name === PROYECTO_ANCHOS) {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })
      await sinScrollHorizontal(page, `no-registrada-${width}`)
      await page.screenshot({ path: join(DIR, `${PREFIJO}-${width}-no-registrada.png`) })
    }
  }
  expect(await page.evaluate(() => localStorage.getItem('bigday:outbox'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('bigday:respondida'))).toBeNull()
  await page.getByRole('button', { name: 'Responder de nuevo' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible()
})

test('segunda visita: tras enviar, al volver muestra "ya respondiste" con "Responder de nuevo"', async ({ page }) => {
  const enviados = await simularApi(page)
  await abrir(page)
  await hastaP7(page)
  await page.getByRole('textbox').fill('Ven a conocer las aves')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('status')).toContainText('Recibimos tu respuesta')
  expect(enviados).toHaveLength(1)

  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Gracias, ya respondiste!')
  await expect(page.getByRole('status')).toHaveText('Tu respuesta ya está con nosotros.')
  await expect(page.getByRole('button', { name: 'Comenzar' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Responder de nuevo' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible()
  expect(enviados).toHaveLength(1) // volver no reenvía nada
})

test('al volver tras responder muestra "ya respondiste" y permite responder de nuevo', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bigday:respondida', '2026-10-17T12:00:00.000Z'))
  await abrir(page, {}, 'ya respondiste')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('¡Gracias, ya respondiste!')
  await sinScrollHorizontal(page, 'ya-respondiste')
  await page.getByRole('button', { name: 'Responder de nuevo' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('button', { name: 'Comenzar' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('bigday:respondida'))).toBeNull()
})

test('rechazada por el servidor: muestra el mensaje y permite revisar sin perder respuestas', async ({ page }) => {
  await simularApi(page, 400, { error: 'Respuesta inválida' })
  await abrir(page)
  await hastaP7(page, ['b', 'b', 'b', 'b', 'b', '9'])
  await page.getByRole('textbox').fill('Vale mucho la pena')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.clock.runFor(PASO_MS)
  await expect(page.getByRole('status')).toHaveText('Respuesta inválida')
  await page.getByRole('button', { name: 'Revisar mis respuestas' }).click()
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 6)
  await expect(page.getByRole('textbox')).toHaveValue('Vale mucho la pena')
})

test('durante la transición de salida no se aplican teclas ni clics a la pregunta nueva', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Comenzar' }).click()
  await page.clock.runFor(PASO_MS)
  await page.keyboard.press('a') // P1
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 1)

  // P2: "c" y, ya en la salida (600 ms de avance + ~150 ms de los 280 ms del fundido), otra "c".
  // Además Escape y Enter dentro de esa ventana: no deben volver atrás ni validar P3.
  // La tarjeta de P2 sigue en el DOM (saliendo): la prueba realmente cae dentro de la ventana.
  await page.keyboard.press('c')
  await page.clock.runFor(800)
  await expect(page.locator('[data-pregunta="p2"]')).toBeAttached()
  await page.keyboard.press('c')
  await page.keyboard.press('Escape')
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 2)
  await expect(page.locator('[data-pregunta="p2"]')).not.toBeAttached()
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 2) // P3 no se respondió, no se saltó y no se volvió a P2

  // P3 → P4: Enter dentro de la ventana de salida no valida P4 (sin error).
  await page.keyboard.press('a')
  await page.clock.runFor(800)
  await expect(page.locator('[data-pregunta="p3"]')).toBeAttached()
  await page.keyboard.press('Enter')
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 3)
  await expect(page.getByRole('alert')).toHaveText('')

  // Hasta P7, escribir, volver a P6 y elegir: durante la salida hacia P7 se hace clic en otro número.
  for (const tecla of ['a', 'a', '8']) {
    await page.keyboard.press(tecla)
    await page.clock.runFor(PASO_MS)
  }
  await enPregunta(page, 6)
  await page.getByRole('textbox').fill('Un lugar lleno de vida')
  await page.getByRole('button', { name: 'Atrás' }).click()
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 5)
  await page.getByRole('radio', { name: '5', exact: true }).click()
  await page.clock.runFor(800)
  await expect(page.locator('[data-pregunta="p6"]')).toBeAttached()
  await page.locator('[data-valor="3"]').click()
  await page.keyboard.press('Enter')
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 6)
  await expect(page.getByRole('textbox')).toHaveValue('Un lugar lleno de vida')
  await expect(page.getByRole('alert')).toHaveText('')
  await page.clock.runFor(PASO_MS)
  await enPregunta(page, 6)
})

/**
 * Transformación que GSAP escribe en línea en el ave de la rama (y su cuerpo), en varios instantes
 * del reloj falso (cada 50 ms). Se lee el estilo en línea y no el computado: con reduced-motion la
 * regla global `transition-duration: 0.01ms` crea transiciones CSS de un frame (tiempo real) y el
 * valor computado puede ir un frame por detrás del reloj falso.
 */
async function muestrearAveDeRama(page: Page, muestras: number) {
  const lecturas: { paso: string | null; ave: string; cuerpo: string }[] = []
  for (let i = 0; i < muestras; i++) {
    lecturas.push(
      await page.evaluate(() => ({
        paso: document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') ?? null,
        ave: document.querySelector<HTMLElement>('.progreso__ave')!.style.transform,
        cuerpo: document.querySelector<HTMLElement>('.progreso__cuerpo')!.style.transform,
      })),
    )
    await page.clock.runFor(50)
  }
  return lecturas
}

/** Sin desplazamiento ni giro: todos los números de la transformación son 0 (o no hay). */
const enReposo = (t: string) => (t.match(/-?\d+(\.\d+)?/g) ?? []).every((n) => Number(n) === 0)

/** Posiciones distintas consecutivas del ave a lo largo de las muestras. */
const posiciones = (lecturas: { ave: string }[]) => lecturas.map((l) => l.ave).filter((v, i, xs) => i === 0 || v !== xs[i - 1])

test.describe('con prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('reducedMotion: sin animaciones de vuelo ni ave saltando en la rama de progreso', async ({ page }) => {
    await abrir(page)
    expect(await page.locator('.hero__ave').evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
    await page.getByRole('button', { name: 'Comenzar' }).click()
    await page.clock.runFor(PASO_MS)
    await enPreguntaEstable(page, 0)
    // Pasa de sobra la primera oleada ambiental (2,5 s): no despega ninguna.
    await page.clock.runFor(20_000)
    await expect(page.locator('.ave--volando')).toHaveCount(0)
    // Elegir en P1 y muestrear el ave de la rama cada 50 ms durante 1,5 s (avance + transición).
    await page.keyboard.press('a')
    // Al elegir no despega la bandada; ninguna animación WAAPI de vuelo existe.
    await expect(page.locator('.ave--volando')).toHaveCount(0)
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.constructor.name === 'Animation').length)).toBe(0)
    const lecturas = await muestrearAveDeRama(page, 30)
    // El ave se coloca de golpe en el nodo 2: solo dos posiciones (nodo 1 y nodo 2), sin valores
    // intermedios ni vuelta atrás, y el cuerpo nunca se eleva ni gira.
    expect(posiciones(lecturas), JSON.stringify(lecturas)).toHaveLength(2)
    expect(lecturas.at(-1)!.paso).toBe('2')
    expect(lecturas.every((l) => enReposo(l.cuerpo)), JSON.stringify(lecturas)).toBe(true)
    await page.clock.runFor(PASO_MS)
    await enPregunta(page, 1)
  })

  test('bienvenida sin animaciones de vuelo', async ({ page }) => {
    const anchos = test.info().project.name === PROYECTO_ANCHOS
    await abrir(page, anchos ? { width: 375, height: 812 } : {})
    const animacionHero = await page.locator('.hero__ave').evaluate((el) => getComputedStyle(el).animationName)
    expect(animacionHero).toBe('none')
    await sinScrollHorizontal(page, 'bienvenida-reduced')
    if (anchos) await page.screenshot({ path: join(DIR, `${PREFIJO}-375-bienvenida-reduced.png`) })
  })
})

test('control: sin reduced-motion el ave de la rama sí salta (la prueba anterior detecta el salto)', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Comenzar' }).click()
  await page.clock.runFor(PASO_MS)
  await enPreguntaEstable(page, 0)
  await page.keyboard.press('a')
  const lecturas = await muestrearAveDeRama(page, 30)
  expect(posiciones(lecturas).length, JSON.stringify(lecturas)).toBeGreaterThan(2)
  expect(lecturas.some((l) => !enReposo(l.cuerpo)), JSON.stringify(lecturas)).toBe(true)
})
