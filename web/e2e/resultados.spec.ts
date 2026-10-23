import AxeBuilder from '@axe-core/playwright'
import { QUESTIONS, labelFor } from '@bigday/shared'
import { type Page, type Request } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resultadosDePrueba, resultadosVacios } from '../test/resultados-datos'
import { expect, test } from './fixtures'
import { soloEnProyectoDeAnchos } from './utilidades'

// Vista de estadísticas protegida con token (resultados.html), con la API de producción simulada:
// GET /resultados y /resultados.csv con page.route (la red real está bloqueada por fixtures.ts).
// Funcionales en los tres proyectos; anchos fijos 320/375/1440, axe y capturas solo en Desktop Chrome.
const DIR = resolve(process.env.CAPTURAS_DIR ?? 'test-results/capturas')
const PREFIJO = process.env.CAPTURAS_PREFIJO ?? 'resultados'
mkdirSync(DIR, { recursive: true })

const TOKEN = 'token-de-prueba-9f8e7d6c5b4a'
const CSV = '﻿uuid,fecha,p1,p2\r\n11111111-1111-4111-8111-111111111111,2026-10-17 10:30,B,cementerio\r\n'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, accept',
  'access-control-allow-methods': 'GET',
  'access-control-expose-headers': 'Retry-After, RateLimit, RateLimit-Policy',
}

interface Simulacion {
  /** Estado forzado para ambos endpoints (sin él: 200 con el token correcto, 401 con cualquier otro). */
  estado?: number
  cuerpo?: unknown
  cabeceras?: Record<string, string>
  datos?: () => unknown
}

/** Simula la API de resultados; devuelve las cabeceras Authorization recibidas y las URLs pedidas. */
async function simularApi(page: Page, sim: Simulacion = {}) {
  const auth: string[] = []
  const urls: string[] = []
  const responder = (esCsv: boolean) => async (route: import('@playwright/test').Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    auth.push(req.headers()['authorization'] ?? '')
    urls.push(req.url())
    const ok = req.headers()['authorization'] === `Bearer ${TOKEN}`
    const estado = sim.estado ?? (ok ? 200 : 401)
    if (estado !== 200) {
      return route.fulfill({
        status: estado,
        contentType: 'application/json',
        headers: { ...CORS, ...sim.cabeceras },
        body: JSON.stringify(sim.cuerpo ?? { error: 'No autorizado.' }),
      })
    }
    if (esCsv) {
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="bigday-respuestas.csv"' },
        body: CSV,
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...CORS, 'cache-control': 'no-store' },
      body: JSON.stringify((sim.datos ?? resultadosDePrueba)()),
    })
  }
  await page.route(/\/api\/bigday\/v1\/resultados$/, responder(false))
  await page.route(/\/api\/bigday\/v1\/resultados\.csv$/, responder(true))
  return { auth, urls }
}

/** Registra toda URL pedida y todo mensaje de consola, para comprobar que el token nunca aparece. */
function vigilarFugas(page: Page) {
  const textos: string[] = []
  page.on('request', (r: Request) => textos.push(r.url()))
  page.on('console', (m) => textos.push(m.text()))
  return () => expect(textos.filter((t) => t.includes(TOKEN))).toEqual([])
}

async function abrir(page: Page) {
  await page.goto('./resultados.html')
  await page.evaluate(() => document.fonts.ready)
}

async function entrar(page: Page, token = TOKEN) {
  await page.getByLabel('Token de resultados').fill(token)
  await page.getByRole('button', { name: 'Ver resultados' }).click()
}

const tablero = (page: Page) => page.getByRole('heading', { level: 1, name: 'Resultados del 2.º October Big Day' })

async function sinScrollHorizontal(page: Page, donde: string) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    // Para diagnosticar: elementos que se salen por la derecha.
    fuera: [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
  }))
  expect(m.scrollWidth, `${donde}: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.innerWidth)
}

test('la página no se indexa (meta robots) y no está enlazada desde la encuesta', async ({ page }) => {
  await abrir(page)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  await expect(page).toHaveTitle('Resultados · 2.º October Big Day')
  await page.goto('./')
  await expect(page.locator('a[href*="resultados"]')).toHaveCount(0)
})

test('token incorrecto → "Token incorrecto" y sigue en el formulario', async ({ page }) => {
  const sinFugas = vigilarFugas(page)
  const api = await simularApi(page)
  await abrir(page)
  const campo = page.getByLabel('Token de resultados')
  await expect(campo).toHaveAttribute('type', 'password')
  await expect(campo).toHaveAttribute('autocomplete', 'off')
  await expect(campo).not.toHaveAttribute('name', /.*/)
  await entrar(page, 'token-equivocado')
  await expect(page.getByRole('alert')).toContainText('Token incorrecto')
  await expect(campo).toBeVisible()
  await expect(campo).toHaveAttribute('aria-invalid', 'true')
  expect(api.auth).toEqual(['Bearer token-equivocado'])
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
  sinFugas()
})

test('token correcto → todas las secciones con los números simulados', async ({ page }) => {
  const sinFugas = vigilarFugas(page)
  const api = await simularApi(page)
  await abrir(page)
  await entrar(page)
  await expect(tablero(page)).toBeVisible()
  await expect(tablero(page)).toBeFocused()

  // El token viaja solo en Authorization, nunca en la URL.
  expect(api.auth).toEqual([`Bearer ${TOKEN}`])
  expect(api.urls.every((u) => u.endsWith('/api/bigday/v1/resultados'))).toBe(true)

  // KPI
  const kpis = page.getByRole('region', { name: 'Indicadores principales' })
  await expect(kpis.locator('.kpi--principal .kpi__cifra')).toHaveText('120')
  await expect(kpis.locator('.kpi--nps .kpi__cifra')).toContainText('+55')
  await expect(kpis).toContainText('Promotores (9–10): 80 (66,7\u00a0%)')
  await expect(kpis).toContainText('Pasivos (7–8): 26 (21,7\u00a0%)')
  await expect(kpis).toContainText('Detractores (1–6): 14 (11,7\u00a0%)')
  await expect(kpis).toContainText('Escala de 1 a 10 (spec §7)')
  await expect(kpis).toContainText('82\u00a0%') // (46 + 52) / 120 nueva percepción

  // Matriz P2 × P3 y destacado (cementerio → parque_vida 27 + ambas 24 de 64 = 80 %)
  const percepcion = page.getByRole('region', { name: 'Cambio de percepción (P2 → P3)' })
  await expect(percepcion).toContainText(`80\u00a0% de quienes antes lo asociaban con «${labelFor('p2', 'cementerio')}»`)
  await expect(percepcion).toContainText('(51 de 64)')
  const ancho = page.viewportSize()!.width
  if (ancho >= 760) {
    const tabla = percepcion.getByRole('table')
    await expect(tabla.getByRole('columnheader', { name: labelFor('p3', 'parque_vida') })).toBeVisible()
    const fila = tabla.getByRole('row', { name: new RegExp(`^${labelFor('p2', 'cementerio')}`) })
    await expect(fila.getByRole('cell').nth(1)).toContainText('27')
    await expect(fila.getByRole('cell').nth(1)).toContainText('42\u00a0%')
  } else {
    await expect(percepcion.getByRole('table')).toBeHidden()
    await expect(percepcion.getByRole('heading', { name: /^Antes: «Un parque cementerio\.»\s*,\s*64 respuestas$/ })).toBeVisible()
    // Compacta: sin combinaciones vacías (no_conocia → memoria es 0), con resumen de P3 y total general.
    const grupoNoConocia = percepcion.locator('.matriz-lista__grupo', { hasText: labelFor('p2', 'no_conocia') })
    await expect(grupoNoConocia.getByRole('listitem')).toHaveCount(2)
    await expect(grupoNoConocia).not.toContainText(labelFor('p3', 'memoria'))
    await expect(percepcion).toContainText('Se omiten las combinaciones sin respuestas.')
    const resumen = percepcion.locator('.matriz-lista__resumen')
    await expect(resumen.getByRole('heading')).toHaveText('Ahora (P3), todas las respuestas, Total: 120 respuestas')
    await expect(resumen.getByRole('listitem')).toHaveCount(5)
    await expect(resumen.getByRole('listitem').nth(1)).toHaveText(`${labelFor('p3', 'parque_vida')}46 respuestas, 38\u00a0%`)
  }

  // P6 (columnas con texto alternativo) y P1–P5 con enunciados y opciones literales
  await expect(page.getByRole('heading', { name: QUESTIONS[5].title })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Respuestas por valor de 1 a 10: 1: 2 .*10: 49 \(40,8\s%\)\.$/ })).toBeAttached()
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5'] as const) {
    const q = QUESTIONS.find((x) => x.id === id)!
    const figura = page.getByRole('figure', { name: q.title })
    await expect(figura).toBeVisible()
    if (q.type === 'single') for (const o of q.options) await expect(figura.getByText(o.label, { exact: true })).toBeVisible()
  }
  await expect(page.getByRole('figure', { name: QUESTIONS[0].title }).getByRole('listitem').nth(1)).toContainText(
    '47 respuestas, 39\u00a0%',
  )

  // Frases: 20, como texto (el marcado se ve literal, nunca se interpreta)
  const frases = page.getByRole('region', { name: 'Frases recientes (P7)' })
  await expect(frases.getByRole('listitem')).toHaveCount(20)
  await expect(frases.getByText('Me encantó <b>todo</b>, hasta los talleres de pintura.')).toBeVisible()
  await expect(frases.locator('b')).toHaveCount(0)
  sinFugas()
})

test('recargar mantiene la sesión; "Salir" la borra', async ({ page }) => {
  const api = await simularApi(page)
  await abrir(page)
  await entrar(page)
  await expect(tablero(page)).toBeVisible()
  await page.reload()
  await expect(tablero(page)).toBeVisible()
  await expect(page.getByLabel('Token de resultados')).toHaveCount(0)
  expect(api.auth).toEqual([`Bearer ${TOKEN}`, `Bearer ${TOKEN}`])

  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page.getByLabel('Token de resultados')).toBeFocused()
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
  await page.reload()
  await expect(page.getByLabel('Token de resultados')).toBeVisible()
  expect(api.auth).toHaveLength(2)
})

test('al imprimir, la tabla de P6 sale aunque «Ver tabla» esté cerrado', async ({ page }) => {
  await simularApi(page)
  await abrir(page)
  await entrar(page)
  await expect(tablero(page)).toBeVisible()
  const tabla = page.locator('.tabla-detalle table') // cerrado no está en el árbol de accesibilidad
  await expect(tabla).toBeHidden()
  await expect(tabla.locator('tbody tr').last()).toContainText('40,8\u00a0%') // % con 1 decimal
  // beforeprint abre el <details>; afterprint lo deja como estaba.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  await expect(tabla).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(tabla).toBeHidden()
  // Respaldo en CSS (@media print + ::details-content), por si el navegador no emite beforeprint.
  await page.emulateMedia({ media: 'print' })
  await expect(tabla).toBeVisible()
})

test('"Actualizar" vuelve a consultar y muestra los datos nuevos', async ({ page }) => {
  let total = 120
  const api = await simularApi(page, { datos: () => ({ ...resultadosDePrueba(), total }) })
  await abrir(page)
  await entrar(page)
  await expect(page.locator('.kpi--principal .kpi__cifra')).toHaveText('120')
  total = 121
  await page.getByRole('button', { name: 'Actualizar' }).click()
  await expect(page.locator('.kpi--principal .kpi__cifra')).toHaveText('121')
  expect(api.auth).toHaveLength(2)
})

test('503: "aún no están habilitados en el servidor"', async ({ page }) => {
  await simularApi(page, {
    estado: 503,
    cuerpo: { error: 'Los resultados no están disponibles: configuración del servidor incompleta.' },
  })
  await abrir(page)
  await entrar(page)
  await expect(page.getByRole('alert')).toHaveText('Los resultados aún no están habilitados en el servidor.')
})

test('429: pide esperar lo que indica Retry-After', async ({ page }) => {
  await simularApi(page, {
    estado: 429,
    cuerpo: { error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' },
    cabeceras: { 'Retry-After': '120' },
  })
  await abrir(page)
  await entrar(page)
  await expect(page.getByRole('alert')).toHaveText('Demasiados intentos. Espera 2 minutos y vuelve a intentarlo.')
})

test('sin conexión con la API: mensaje de red', async ({ page }) => {
  // Sin simulación: fixtures.ts aborta la petición a la API de producción.
  await abrir(page)
  await entrar(page)
  await expect(page.getByRole('alert')).toContainText('No hay conexión con el servidor')
})

test('estado vacío cuando total = 0', async ({ page }) => {
  await simularApi(page, { datos: resultadosVacios })
  await abrir(page)
  await entrar(page)
  await expect(page.getByRole('heading', { name: 'Aún no hay respuestas' })).toBeVisible()
  await expect(page.locator('.kpi--principal .kpi__cifra')).toHaveText('0')
  await expect(page.locator('.kpi--nps .kpi__cifra')).toContainText('—')
  await expect(page.getByRole('region', { name: 'Frases recientes (P7)' })).toHaveCount(0)
})

test('"Descargar CSV" guarda bigday-respuestas.csv con el contenido de la API', async ({ page }) => {
  const sinFugas = vigilarFugas(page)
  const api = await simularApi(page)
  await abrir(page)
  await entrar(page)
  await expect(tablero(page)).toBeVisible()
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar CSV' }).click(),
  ])
  expect(descarga.suggestedFilename()).toBe('bigday-respuestas.csv')
  const ruta = await descarga.path()
  expect(readFileSync(ruta, 'utf8')).toBe(CSV)
  expect(api.urls.at(-1)).toMatch(/\/api\/bigday\/v1\/resultados\.csv$/)
  expect(api.auth.at(-1)).toBe(`Bearer ${TOKEN}`)
  sinFugas()
})

const VISTAS = [
  { nombre: '320', width: 320, height: 640, capturas: false },
  { nombre: '375', width: 375, height: 812, capturas: true },
  { nombre: '1440', width: 1440, height: 900, capturas: true },
] as const

for (const vista of VISTAS) {
  test(`a ${vista.nombre} px: sin scroll horizontal y axe sin violaciones (acceso y tablero)`, async ({ page }) => {
    soloEnProyectoDeAnchos()
    await page.setViewportSize({ width: vista.width, height: vista.height })
    await simularApi(page)
    await abrir(page)

    await sinScrollHorizontal(page, 'acceso')
    const axeAcceso = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(axeAcceso.violations, JSON.stringify(axeAcceso.violations, null, 2)).toEqual([])
    if (vista.capturas) await page.screenshot({ path: join(DIR, `${PREFIJO}-acceso-${vista.nombre}.png`), fullPage: true })

    await entrar(page)
    await expect(tablero(page)).toBeVisible()
    await page.getByText('Ver tabla').click() // también se mide la tabla de P6
    await sinScrollHorizontal(page, 'tablero')
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([])
    // El fondo es un degradado de CSS: axe debe poder medir todo el texto (nada "incompleto" por contraste).
    const contraste = axe.incomplete.filter((r) => r.id === 'color-contrast').flatMap((r) => r.nodes.map((n) => n.target.join(' ')))
    expect(contraste, 'nodos sin medir').toEqual([])
    if (vista.capturas) await page.screenshot({ path: join(DIR, `${PREFIJO}-${vista.nombre}.png`), fullPage: true })
  })
}
