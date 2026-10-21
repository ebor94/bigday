/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const componente: DefineComponent<object, object, unknown>
  export default componente
}

interface ImportMetaEnv {
  /** Base de la API (por defecto `/api/bigday/v1`, detrás del mismo Nginx). */
  readonly VITE_API_BASE?: string
}
