import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type mysql from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearPool, crearRepositorioMysql, type FilaRespuesta } from '../src/db'

// Solo corre si hay una BD de prueba: TEST_DB_HOST (+ TEST_DB_PORT, TEST_DB_USER, TEST_DB_PASSWORD, TEST_DB_NAME).
const hayBd = Boolean(process.env.TEST_DB_HOST)

const fila = (uuid: string): FilaRespuesta => ({
  uuid,
  p1: 'A',
  p2: 'ambas',
  p3: 'memoria',
  p3_otro: null,
  p4: 'diversidad',
  p4_otro: null,
  p5: 'B',
  p6: 8,
  p7: 'Texto de prueba de integración.',
  origen: null,
  duracion_seg: 30,
  ip_hash: 'a'.repeat(64),
  ua_hash: 'b'.repeat(64),
})

describe.skipIf(!hayBd)('repositorio MySQL (integración)', () => {
  let pool: mysql.Pool

  beforeAll(async () => {
    const { createConnection } = await import('mysql2/promise')
    const conexion = await createConnection({
      host: process.env.TEST_DB_HOST as string,
      port: Number(process.env.TEST_DB_PORT) || 3306,
      user: process.env.TEST_DB_USER ?? 'root',
      password: process.env.TEST_DB_PASSWORD ?? '',
      database: process.env.TEST_DB_NAME ?? 'serfuweb',
      multipleStatements: true,
    })
    await conexion.query('DROP TABLE IF EXISTS bigday_respuestas')
    await conexion.query(readFileSync(resolve(__dirname, '../sql/001_init.sql'), 'utf8'))
    await conexion.end()
    pool = crearPool({
      host: process.env.TEST_DB_HOST as string,
      port: Number(process.env.TEST_DB_PORT) || 3306,
      user: process.env.TEST_DB_USER ?? 'root',
      password: process.env.TEST_DB_PASSWORD ?? '',
      database: process.env.TEST_DB_NAME ?? 'serfuweb',
    })
  })

  afterAll(async () => {
    await pool?.end()
  })

  it('ping() funciona', async () => {
    await expect(crearRepositorioMysql(pool).ping()).resolves.toBeUndefined()
  })

  it('guardar() devuelve creada y luego duplicada para el mismo uuid, sin duplicar filas', async () => {
    const repo = crearRepositorioMysql(pool)
    const uuid = '11111111-2222-4333-8444-555555555555'
    expect(await repo.guardar(fila(uuid))).toBe('creada')
    expect(await repo.guardar(fila(uuid))).toBe('duplicada')
    const [filas] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM bigday_respuestas WHERE uuid = ?',
      [uuid],
    )
    expect(filas[0]?.n).toBe(1)
  })
})
