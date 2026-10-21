import { defineConfig } from 'tsup'

// @bigday/shared se distribuye como fuente TS: se empaqueta dentro del bundle.
// El resto de dependencias npm quedan externas.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  noExternal: ['@bigday/shared'],
})
