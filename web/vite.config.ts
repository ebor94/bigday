import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Subruta de producción: https://losolivoscucuta.com/bigDay-encuesta/ (AppServ, www/bigDay-encuesta).
// Se eligió base absoluta y no relativa ('./'): index.html y todos los assets (JS/CSS con hash e
// `img/`) quedan con la ruta completa, igual en dev, preview y producción, y `BASE_URL` en el código
// resuelve las imágenes de `public/`. Con './' la URL sin barra final (/bigDay-encuesta) las rompería.
export const BASE = '/bigDay-encuesta/'

export default defineConfig({
  base: BASE,
  plugins: [vue()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
})
