export function computeSourceHash(bytes: Uint8Array): string
export function buildHeader(hash: string): string
export function parseEmbeddedHash(contenido: string): string | null
export function evaluarEstado(contenido: string | null, hashFuente: string): { ok: boolean; mensaje: string }
