// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error -- script .mjs sin tipos (solo para auditorías locales)
import { servir } from '../scripts/servidor-estatico.mjs'

let srv: { url: string; cerrar: () => Promise<void> }

/** GET con la ruta cruda (sin que el cliente la normalice ni la vuelva a codificar). */
function estado(ruta: string): Promise<number> {
  const { port } = new URL(srv.url)
  return new Promise((ok, mal) => {
    request({ host: '127.0.0.1', port, path: ruta }, (res) => {
      res.resume()
      ok(res.statusCode ?? 0)
    })
      .on('error', mal)
      .end()
  })
}

beforeAll(async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'bigday-estatico-'))
  writeFileSync(join(raiz, 'index.html'), '<!doctype html><title>ok</title>')
  srv = await servir(raiz, 0, '/bigDay-encuesta/')
})
afterAll(() => srv.cerrar())

describe('servidor estático de auditoría', () => {
  it('sirve index.html bajo la subruta', async () => {
    expect(await estado('/bigDay-encuesta/')).toBe(200)
  })

  it('una ruta con codificación % inválida responde 400 (no tumba el servidor)', async () => {
    expect(await estado('/bigDay-encuesta/%E0%A4%A')).toBe(400)
    expect(await estado('/bigDay-encuesta/%')).toBe(400)
    // y el servidor sigue vivo
    expect(await estado('/bigDay-encuesta/')).toBe(200)
  })
})
