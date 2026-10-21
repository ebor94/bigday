// Servidor estático mínimo para auditar `dist` como en producción: Apache (AppServ) comprime
// con mod_deflate, mientras que `vite preview` no lo hace de forma fiable. Aquí se sirve con
// gzip todo recurso de texto (html, js, css, svg, json) y caché larga para `assets/` (con hash).
// Sin dependencias: http + zlib de Node.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { createGzip } from 'node:zlib'

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}
const COMPRIMIBLES = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt'])

/**
 * Sirve `raiz` en `puerto` (0 = libre) bajo la subruta `prefijo` (p. ej. '/bigDay-encuesta/',
 * como en producción; por defecto '/'). Devuelve { url, cerrar }.
 * Fuera del prefijo → 404. Ruta con codificación % inválida → 400. Rutas desconocidas sin extensión → index.html (SPA).
 */
export function servir(raiz, puerto = 0, prefijo = '/') {
  const base = resolve(raiz)
  const pref = `/${prefijo.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '')
  const servidor = createServer((req, res) => {
    let completa
    try {
      completa = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    } catch {
      res.writeHead(400).end() // codificación % inválida: no debe tumbar el servidor
      return
    }
    if (pref && completa !== pref && !completa.startsWith(`${pref}/`)) {
      res.writeHead(404).end()
      return
    }
    const ruta = pref ? completa.slice(pref.length) || '/' : completa
    let archivo = normalize(join(base, ruta))
    if (archivo !== base && !archivo.startsWith(base + sep)) {
      res.writeHead(403).end()
      return
    }
    if (existsSync(archivo) && statSync(archivo).isDirectory()) archivo = join(archivo, 'index.html')
    if (!existsSync(archivo)) {
      if (extname(ruta)) {
        res.writeHead(404).end()
        return
      }
      archivo = join(base, 'index.html')
    }
    const ext = extname(archivo)
    const cabeceras = {
      'Content-Type': TIPOS[ext] ?? 'application/octet-stream',
      'Cache-Control': ruta.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      Vary: 'Accept-Encoding',
    }
    const aceptaGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
    if (COMPRIMIBLES.has(ext) && aceptaGzip) {
      res.writeHead(200, { ...cabeceras, 'Content-Encoding': 'gzip' })
      createReadStream(archivo).pipe(createGzip({ level: 9 })).pipe(res)
    } else {
      res.writeHead(200, { ...cabeceras, 'Content-Length': statSync(archivo).size })
      createReadStream(archivo).pipe(res)
    }
  })
  return new Promise((ok) => {
    servidor.listen(puerto, '127.0.0.1', () => {
      const { port } = servidor.address()
      ok({ url: `http://127.0.0.1:${port}${pref}/`, cerrar: () => new Promise((fin) => servidor.close(fin)) })
    })
  })
}
