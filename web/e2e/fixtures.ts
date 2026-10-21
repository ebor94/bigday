import { test as base } from '@playwright/test'

// Red de seguridad: el build de las pruebas apunta a la API de PRODUCCIÓN (web/.env.production).
// Esta ruta, a nivel de contexto, aborta cualquier petición a ese host. Las rutas que cada prueba
// registra con page.route tienen prioridad sobre las del contexto, así que lo que la prueba simula
// explícitamente sigue funcionando y lo demás nunca sale a la red.
// Todas las specs importan `test` de aquí, no de '@playwright/test'.
export const API_PRODUCCION_HOST = /^https?:\/\/mantix-api\.losolivoscucuta\.com(:\d+)?\//

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(API_PRODUCCION_HOST, (route) => route.abort('blockedbyclient'))
    await use(context)
  },
})

export { expect } from '@playwright/test'
