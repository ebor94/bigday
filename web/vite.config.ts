import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Subruta de producción: https://losolivoscucuta.com/bigDay-encuesta/ (AppServ, www/bigDay-encuesta).
// Se eligió base absoluta y no relativa ('./'): index.html y todos los assets (JS/CSS con hash e
// `img/`) quedan con la ruta completa, igual en dev, preview y producción, y `BASE_URL` en el código
// resuelve las imágenes de `public/`. Con './' la URL sin barra final (/bigDay-encuesta) las rompería.
export const BASE = '/bigDay-encuesta/'

export const PAGINAS = { encuesta: 'index.html', resultados: 'resultados.html' } as const
const PAGINA: keyof typeof PAGINAS = process.env.BIGDAY_PAGINA === 'resultados' ? 'resultados' : 'encuesta'

export default defineConfig({
  base: BASE,
  plugins: [vue()],
  // Dos páginas: la encuesta (index.html) y la vista de estadísticas protegida con token (resultados.html).
  // Se compilan en dos pasadas (ver "build" en package.json; BIGDAY_PAGINA elige la página): así no comparten
  // chunks y el bundle de la encuesta es idéntico con o sin la vista de resultados (con una sola pasada
  // multipágina Vite saca Vue y @bigday/shared a un chunk común y la encuesta pesa más). La primera pasada
  // vacía dist/; la segunda solo añade. En `vite` (dev) se sirven las dos páginas igual.
  build: {
    emptyOutDir: PAGINA === 'encuesta',
    rollupOptions: { input: fileURLToPath(new URL(`./${PAGINAS[PAGINA]}`, import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
})
