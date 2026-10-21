import { test, type Page, type TestInfo } from '@playwright/test'

// Utilidades compartidas por las pruebas e2e.

/**
 * Proyecto donde corren las pruebas que fijan anchos concretos (320/375/1440 px) y guardan capturas.
 * En "Pixel 7" e "iPhone 13" serían el mismo motor con un viewport forzado: se omiten para no duplicar.
 */
export const PROYECTO_ANCHOS = 'Desktop Chrome'

/** Omite la prueba actual fuera del proyecto de anchos fijos. */
export function soloEnProyectoDeAnchos() {
  test.skip(
    test.info().project.name !== PROYECTO_ANCHOS,
    `anchos fijos y capturas solo en "${PROYECTO_ANCHOS}"`,
  )
}

/** Nombre del proyecto apto para archivos ("iPhone 13" → "iphone-13"). */
export const sufijoProyecto = (info: TestInfo = test.info()) => info.project.name.toLowerCase().replace(/\s+/g, '-')

/**
 * Detiene el reloj falso de Playwright (ya instalado) un instante en el futuro.
 * `pauseAt` falla con "Cannot fast-forward to the past" si entre leer `Date.now()` y pausar
 * pasan más de los milisegundos de margen (máquina cargada, tres proyectos en paralelo):
 * se reintenta con una lectura nueva y un margen mayor. Así ningún temporizador de la app se adelanta.
 */
export async function detenerReloj(page: Page, margenMs = 50) {
  for (let intento = 0; ; intento++) {
    const ahora = await page.evaluate(() => Date.now())
    try {
      await page.clock.pauseAt(ahora + margenMs * 2 ** intento)
      return
    } catch (e) {
      if (intento >= 5 || !String(e).includes('Cannot fast-forward to the past')) throw e
    }
  }
}
