<script setup lang="ts">
// Capas de aves: dibujan las aves del store compartido y reproducen cada vuelo con la
// Web Animations API (solo `transform` y `opacity`, compuestas en GPU).
//
// Orden de apilado (spec §5: las aves ambientales "cruzan el fondo"):
// - Capa de fondo (z-index 0): aves ambientales. Va después de WatercolorBackground en el DOM
//   (mismo z-index 0), así que pinta sobre la acuarela y bajo el contenido (z-index 1).
// - Capa frontal (z-index 2): bandada y aves posadas, que deben verse despegar DESDE la
//   tarjeta elegida y quedar SOBRE su elemento.
// Ninguna estorba: `pointer-events: none` y `aria-hidden`. El contenedor no crea contexto
// de apilado (sin position/z-index), para que cada capa compita con la página.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { posicionPosada, useBirds, type Ave } from '../composables/useBirds'
import BirdSprite from './BirdSprite.vue'

const { aves, oculto, terminarVuelo } = useBirds()
const capa = ref<HTMLElement | null>(null)
const avesFondo = computed(() => aves.value.filter((a) => a.tipo === 'ambient'))
const avesFrente = computed(() => aves.value.filter((a) => a.tipo !== 'ambient'))

/** Animación de cada ave (null si no tiene: ave posada estática). */
const animaciones = new Map<number, Animation | null>()

/** El ave posada se apoya sobre el borde: su centro queda un poco por encima. */
const ALTURA_POSADA_PX = 10

function elementoDe(id: number) {
  return capa.value?.querySelector<HTMLElement>(`[data-ave="${id}"]`) ?? null
}

function iniciar(ave: Ave) {
  const el = elementoDe(ave.id)
  const objetivo = el?.querySelector<HTMLElement>('.ave__vuelo')
  const volando = ave.tipo !== 'perched'
  if (!objetivo || !ave.fotogramas.length || typeof objetivo.animate !== 'function') {
    animaciones.set(ave.id, null)
    if (volando) terminarVuelo(ave.id)
    return
  }
  const anim = objetivo.animate(ave.fotogramas, {
    duration: ave.duracion,
    delay: ave.retraso,
    easing: volando ? 'linear' : 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'both',
  })
  if (volando) anim.onfinish = () => terminarVuelo(ave.id)
  if (oculto.value) anim.pause()
  animaciones.set(ave.id, anim)
}

// ── Aves posadas: siguen a su elemento (scroll, resize, cambios de tamaño y fuentes) ──

let escuchando = false
let observador: ResizeObserver | null = null
const anclasObservadas = new Set<Element>()

function colocarPosadas() {
  for (const ave of aves.value) {
    if (ave.tipo !== 'perched' || !ave.ancla) continue
    const el = elementoDe(ave.id)
    if (!el) continue
    const { x, y } = posicionPosada(ave.ancla.getBoundingClientRect())
    el.style.transform = `translate(${x}px, ${y - ALTURA_POSADA_PX}px) scale(${ave.escala})`
  }
}

function escucharPosadas(activo: boolean) {
  if (activo === escuchando) return
  escuchando = activo
  const opciones = { passive: true, capture: true }
  // scroll y resize ya se despachan como mucho una vez por frame: no hace falta requestAnimationFrame.
  if (activo) {
    window.addEventListener('scroll', colocarPosadas, opciones)
    window.addEventListener('resize', colocarPosadas, opciones)
  } else {
    window.removeEventListener('scroll', colocarPosadas, opciones)
    window.removeEventListener('resize', colocarPosadas, opciones)
  }
}

/** Observa con ResizeObserver solo las anclas de las aves posadas vigentes. */
function observarAnclas(lista: readonly Ave[]) {
  if (!observador) return
  const vigentes = new Set(lista.flatMap((a) => (a.tipo === 'perched' && a.ancla ? [a.ancla] : [])))
  for (const ancla of anclasObservadas) {
    if (vigentes.has(ancla)) continue
    observador.unobserve(ancla)
    anclasObservadas.delete(ancla)
  }
  for (const ancla of vigentes) {
    if (anclasObservadas.has(ancla)) continue
    observador.observe(ancla)
    anclasObservadas.add(ancla)
  }
}

function sincronizar(lista: readonly Ave[]) {
  const vivas = new Set(lista.map((a) => a.id))
  for (const [id, anim] of animaciones) {
    if (vivas.has(id)) continue
    anim?.cancel()
    animaciones.delete(id)
  }
  for (const ave of lista) if (!animaciones.has(ave.id)) iniciar(ave)
  const hayPosadas = lista.some((a) => a.tipo === 'perched')
  escucharPosadas(hayPosadas)
  observarAnclas(lista)
  // Colocación inmediata (sin esperar un frame) para que el ave nazca en su sitio.
  if (hayPosadas) colocarPosadas()
}

// Primera sincronización al montar (ya existe el DOM de las capas): incluye las aves que
// el store tuviera antes de montarse BirdLayer. Después, cada cambio tras renderizar.
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') observador = new ResizeObserver(() => colocarPosadas())
  sincronizar(aves.value)
  // Al cargar las fuentes cambia el layout del texto: se recolocan las aves posadas.
  void document.fonts?.ready.then(() => {
    if (capa.value) colocarPosadas()
  })
})
watch(aves, sincronizar, { flush: 'post' })

// Pestaña oculta: se pausan los vuelos; al volver, se reanudan donde quedaron.
watch(oculto, (pausar) => {
  for (const anim of animaciones.values()) {
    if (!anim || anim.playState === 'finished') continue
    if (pausar) anim.pause()
    else anim.play()
  }
})

onBeforeUnmount(() => {
  escucharPosadas(false)
  observador?.disconnect()
  observador = null
  anclasObservadas.clear()
  for (const anim of animaciones.values()) anim?.cancel()
  animaciones.clear()
})

/** Aleteo: más rápido en la bandada; las aves lejanas (pequeñas) aletean más despacio. */
function estiloSprite(ave: Ave) {
  const ritmo = ave.tipo === 'flock' ? 0.18 : 0.2 + (1.05 - ave.escala) * 0.25
  return {
    '--aleteo': `${ritmo.toFixed(2)}s`,
    // Desfase por ave para que no aleteen al unísono.
    '--aleteo-retraso': `-${(ave.id * 37) % 300}ms`,
  }
}
</script>

<template>
  <div
    ref="capa"
    class="aves"
    aria-hidden="true"
  >
    <div
      v-for="grupo in [{ nombre: 'fondo', lista: avesFondo }, { nombre: 'frente', lista: avesFrente }]"
      :key="grupo.nombre"
      :class="['capa-aves', `capa-aves--${grupo.nombre}`]"
    >
      <div
        v-for="ave in grupo.lista"
        :key="ave.id"
        :class="['ave', `ave--${ave.tipo}`, { 'ave--volando': ave.tipo !== 'perched' }]"
        :data-ave="ave.id"
        :data-tipo="ave.tipo"
      >
        <div class="ave__vuelo">
          <BirdSprite
            :color="ave.color"
            :aletea="ave.aletea"
            :style="estiloSprite(ave)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.capa-aves {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  /* Aísla la capa: lo que pase dentro no fuerza layout/paint del resto de la página. */
  contain: strict;
}

.capa-aves--fondo {
  z-index: 0;
}

.capa-aves--frente {
  z-index: 2;
}

.ave {
  position: absolute;
  top: 0;
  left: 0;
  width: 48px;
  height: 36px;
  /* El transform de los fotogramas ubica el CENTRO del ave. */
  margin: -18px 0 0 -24px;
}

/* Hasta que arranca la animación (fill: both) el ave en vuelo no se ve. */
.ave--volando .ave__vuelo {
  opacity: 0;
  will-change: transform;
}

.ave__vuelo {
  width: 100%;
  height: 100%;
}
</style>
