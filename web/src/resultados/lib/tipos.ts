// Forma de la respuesta de GET {base}/resultados (mantix-git/src/bigday/services/stats.js).
// El backend manda también los textos (`label`), pero la vista usa SIEMPRE los de @bigday/shared.

export interface ConteoOpcion {
  codigo: string
  label?: string
  total: number
}

export interface ConteoValor {
  valor: number
  total: number
}

export interface NpsApi {
  total: number
  promotores: number
  pasivos: number
  detractores: number
  pctPromotores: number | null
  pctPasivos: number | null
  pctDetractores: number | null
  nps: number | null
}

export interface CeldaMatriz {
  p2: string
  p2Label?: string
  p3: string
  p3Label?: string
  total: number
}

export interface Frase {
  texto: string
  /** ISO 8601. */
  fecha: string
}

export interface Resultados {
  total: number
  distribucion: {
    p1: ConteoOpcion[]
    p2: ConteoOpcion[]
    p3: ConteoOpcion[]
    p4: ConteoOpcion[]
    p5: ConteoOpcion[]
    p6: ConteoValor[]
  }
  nps: NpsApi
  matrizP2P3: CeldaMatriz[]
  ultimasFrases: Frase[]
}
