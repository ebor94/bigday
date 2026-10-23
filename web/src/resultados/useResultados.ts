// Estado de la vista de resultados: formulario del token → carga → datos (o error).
// - El token vive en la sesión (sessionStorage) y en este cierre; no se expone como ref ni se registra.
// - "Actualizar" conserva los datos anteriores mientras recarga y si falla (aviso, sin perder la vista).
// - Un 401 con un token guardado (lo cambiaron en el servidor) cierra la sesión.
// - Cada carga lleva un número de turno: una respuesta vieja que llega tarde (p. ej. tras "Salir") se ignora.
// - La descarga del CSV es independiente de las recargas: solo se descarta si entre medio se pulsó "Salir"
//   (cambia la generación de sesión); el botón siempre se reactiva.
import { ref, shallowRef } from 'vue'
import { mensajeError, type ClienteResultados } from './lib/api'
import { NOMBRE_CSV, type ResultadoGuardar } from './lib/descarga'
import type { Sesion } from './lib/sesion'
import type { Resultados } from './lib/tipos'

export type Vista = 'login' | 'cargando' | 'listo' | 'error'

export interface OpcionesResultados {
  cliente: ClienteResultados
  sesion: Sesion
  guardar: (blob: Blob, nombre: string) => ResultadoGuardar | void
  ahora?: () => Date
}

export function useResultados({ cliente, sesion, guardar, ahora = () => new Date() }: OpcionesResultados) {
  const vista = ref<Vista>('login')
  const datos = shallowRef<Resultados | null>(null)
  const actualizadoEn = ref<Date | null>(null)
  const mensajeLogin = ref('')
  /** Aviso sobre los datos (error al actualizar o al descargar). */
  const aviso = ref('')
  const actualizando = ref(false)
  const descargando = ref(false)
  const entrando = ref(false)
  let turno = 0
  /** Cambia solo al salir: invalida las descargas en curso de la sesión anterior. */
  let generacion = 0

  function mostrar(r: Resultados) {
    datos.value = r
    actualizadoEn.value = ahora()
    aviso.value = ''
    vista.value = 'listo'
  }

  function salir(mensaje = '') {
    turno++
    generacion++
    sesion.borrar()
    datos.value = null
    actualizadoEn.value = null
    aviso.value = ''
    actualizando.value = false
    descargando.value = false
    entrando.value = false
    mensajeLogin.value = mensaje
    vista.value = 'login'
  }

  /** Carga con el token de la sesión (primera carga o "Actualizar"). */
  async function cargar() {
    const token = sesion.leer()
    if (!token) return salir()
    const mio = ++turno
    if (datos.value) actualizando.value = true
    else vista.value = 'cargando'
    const r = await cliente.obtener(token)
    if (mio !== turno) return
    actualizando.value = false
    if (r.tipo === 'ok') return mostrar(r.datos)
    if (r.tipo === 'no_autorizado') return salir(mensajeError(r))
    aviso.value = mensajeError(r)
    if (!datos.value) vista.value = 'error'
  }

  async function iniciar() {
    if (sesion.leer()) await cargar()
    else vista.value = 'login'
  }

  async function entrar(token: string) {
    const limpio = token.trim()
    if (!limpio) {
      mensajeLogin.value = 'Escribe el token de resultados.'
      return
    }
    const mio = ++turno
    entrando.value = true
    mensajeLogin.value = ''
    const r = await cliente.obtener(limpio)
    if (mio !== turno) return
    entrando.value = false
    if (r.tipo === 'ok') {
      sesion.guardar(limpio)
      return mostrar(r.datos)
    }
    mensajeLogin.value = mensajeError(r)
  }

  async function descargarCsv() {
    const token = sesion.leer()
    if (!token) return salir()
    const mia = generacion
    descargando.value = true
    try {
      const r = await cliente.descargarCsv(token)
      if (mia !== generacion) return // pulsó "Salir" mientras tanto: no se guarda nada
      if (r.tipo === 'ok') {
        aviso.value = ''
        guardar(r.datos, NOMBRE_CSV)
        return
      }
      if (r.tipo === 'no_autorizado') return salir(mensajeError(r))
      aviso.value = mensajeError(r)
    } finally {
      // Tras "Salir" ya quedó en false; una descarga de una sesión vieja no toca la de la nueva.
      if (mia === generacion) descargando.value = false
    }
  }

  return {
    vista,
    datos,
    actualizadoEn,
    mensajeLogin,
    aviso,
    actualizando,
    descargando,
    entrando,
    iniciar,
    entrar,
    actualizar: cargar,
    salir: () => salir(),
    descargarCsv,
  }
}
