import { createHash } from 'node:crypto'

/** SHA-256 hexadecimal de `valor + sal`. Se usa para IP y user-agent: nunca se guardan en claro. */
export function hashConSal(valor: string, sal: string): string {
  return createHash('sha256')
    .update(valor + sal)
    .digest('hex')
}
