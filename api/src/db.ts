import mysql from 'mysql2/promise'

/** Fila tal como se inserta en `bigday_respuestas`: solo códigos, hashes y NULL en lo vacío. */
export interface FilaRespuesta {
  uuid: string
  p1: string
  p2: string
  p3: string
  p3_otro: string | null
  p4: string
  p4_otro: string | null
  p5: string
  p6: number
  p7: string
  origen: string | null
  duracion_seg: number | null
  ip_hash: string | null
  ua_hash: string | null
}

export interface Repositorio {
  guardar(fila: FilaRespuesta): Promise<'creada' | 'duplicada'>
  ping(): Promise<void>
}

export interface ConfigBd {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export function crearPool(cfg: ConfigBd): mysql.Pool {
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    connectionLimit: 10,
    // Sin CLIENT_FOUND_ROWS, affectedRows es 0 cuando ON DUPLICATE KEY no cambia nada:
    // así se distingue 'creada' (1) de 'duplicada' (0).
    flags: ['-FOUND_ROWS'],
  })
}

const SQL_INSERTAR = `INSERT INTO bigday_respuestas
  (uuid, p1, p2, p3, p3_otro, p4, p4_otro, p5, p6, p7, origen, duracion_seg, ip_hash, ua_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE id = id`

export function crearRepositorioMysql(pool: mysql.Pool): Repositorio {
  return {
    async guardar(f) {
      const [res] = await pool.execute<mysql.ResultSetHeader>(SQL_INSERTAR, [
        f.uuid,
        f.p1,
        f.p2,
        f.p3,
        f.p3_otro,
        f.p4,
        f.p4_otro,
        f.p5,
        f.p6,
        f.p7,
        f.origen,
        f.duracion_seg,
        f.ip_hash,
        f.ua_hash,
      ])
      return res.affectedRows === 1 ? 'creada' : 'duplicada'
    },
    async ping() {
      await pool.query('SELECT 1')
    },
  }
}
