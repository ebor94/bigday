import { defineConfig, devices } from '@playwright/test'

// Pruebas en navegador contra el build de producción (vite preview).
// Tres proyectos (spec §10: Chrome Android, Safari iOS, escritorio):
// - "Pixel 7"        → Chromium con emulación móvil (touch, DPR 2.625, 412×839).
// - "iPhone 13"      → WebKit con emulación móvil (touch, DPR 3, 390×664).
// - "Desktop Chrome" → Chromium 1280×720.
// Las pruebas funcionales corren en los tres. Las que fijan anchos concretos (320/375/1440 px)
// y guardan capturas corren solo en "Desktop Chrome" (ver PROYECTO_ANCHOS en e2e/utilidades.ts):
// en los móviles serían el mismo motor con otro viewport forzado, es decir, duplicadas.
// El build se sirve bajo la subruta real de producción (`base` de vite.config.ts) y con la API de
// producción (web/.env.production): por eso toda la API se simula con page.route (nunca hay POST reales).
// `baseURL` termina en "/" y las pruebas navegan con `page.goto('./')`: así se resuelve a la subruta.
const BASE_URL = 'http://localhost:4173/bigDay-encuesta/'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
  },
  projects: [
    { name: 'Pixel 7', use: { ...devices['Pixel 7'] } },
    { name: 'iPhone 13', use: { ...devices['iPhone 13'] } },
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
