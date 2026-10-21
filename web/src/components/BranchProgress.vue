<script setup lang="ts">
// Progreso: una rama horizontal con un nodo por pregunta; un ave salta al nodo actual.
// El salto usa solo `transform` (GSAP); con reduced-motion el ave se coloca sin animar.
// La posición se calcula en px a partir del ancho de la rama (ResizeObserver), porque un
// `translateX(%)` se refiere al ancho del ave y no al de la rama.
import gsap from 'gsap'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useReducedMotion } from '../composables/useReducedMotion'
import BirdSprite from './BirdSprite.vue'

const props = defineProps<{
  /** Pregunta actual (1..total). */
  indice: number
  total: number
}>()

const reducido = useReducedMotion()
const pista = ref<HTMLElement | null>(null)
const ave = ref<HTMLElement | null>(null)
const cuerpo = ref<HTMLElement | null>(null)
const volando = ref(false)
const ancho = ref(0)

const nodos = computed(() => Array.from({ length: props.total }, (_, i) => i + 1))
const fraccion = (i: number) => (props.total > 1 ? (i - 1) / (props.total - 1) : 0)
const destino = () => fraccion(props.indice) * ancho.value

let observador: ResizeObserver | null = null
let linea: gsap.core.Timeline | null = null

function colocar() {
  linea?.kill()
  volando.value = false
  if (ave.value) gsap.set(ave.value, { x: destino() })
  if (cuerpo.value) gsap.set(cuerpo.value, { y: 0, rotation: 0 })
}

function saltar() {
  if (!ave.value || !cuerpo.value || reducido.value) return colocar()
  linea?.kill()
  volando.value = true
  linea = gsap
    .timeline({ onComplete: () => void (volando.value = false) })
    .to(ave.value, { x: destino(), duration: 0.55, ease: 'power2.inOut' }, 0)
    .to(cuerpo.value, { y: -16, rotation: -8, duration: 0.27, ease: 'power2.out' }, 0)
    .to(cuerpo.value, { y: 0, rotation: 0, duration: 0.28, ease: 'bounce.out' }, 0.27)
}

function medir() {
  ancho.value = pista.value?.getBoundingClientRect().width ?? 0
}

onMounted(() => {
  medir()
  colocar()
  if (typeof ResizeObserver !== 'undefined' && pista.value) {
    observador = new ResizeObserver(() => {
      medir()
      colocar()
    })
    observador.observe(pista.value)
  }
})

onBeforeUnmount(() => {
  observador?.disconnect()
  linea?.kill()
})

watch(() => props.indice, saltar)
</script>

<template>
  <div
    class="progreso"
    role="progressbar"
    aria-label="Progreso de la encuesta"
    :aria-valuemin="1"
    :aria-valuemax="total"
    :aria-valuenow="indice"
    :aria-valuetext="`Pregunta ${indice} de ${total}`"
  >
    <svg
      class="progreso__rama"
      viewBox="0 0 100 12"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 7C20 5 35 8 50 6s35-2 50 0"
        fill="none"
        stroke="#6B4A2E"
        stroke-width="3.5"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <div
      ref="pista"
      class="progreso__pista"
    >
      <span
        v-for="n in nodos"
        :key="n"
        :class="[
          'progreso__nodo',
          { 'progreso__nodo--hecho': n < indice, 'progreso__nodo--actual': n === indice },
        ]"
        :style="{ left: `${fraccion(n) * 100}%` }"
        aria-hidden="true"
      />
      <div
        ref="ave"
        class="progreso__ave"
        aria-hidden="true"
      >
        <div
          ref="cuerpo"
          class="progreso__cuerpo"
        >
          <BirdSprite
            color="vermilion"
            :aletea="volando"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progreso {
  position: relative;
  width: 100%;
  max-width: var(--card-max);
  height: 3.5rem;
  margin-inline: auto;
}

.progreso__rama {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0.55rem;
  width: 100%;
  height: 0.9rem;
  overflow: visible;
}

/* La pista deja margen a los lados para que el ave y los nodos extremos no se salgan. */
.progreso__pista {
  position: absolute;
  inset: 0 1.25rem;
}

.progreso__nodo {
  position: absolute;
  bottom: 0.7rem;
  width: 0.85rem;
  height: 0.85rem;
  margin-left: -0.425rem;
  border: 2px solid #6B4A2E;
  border-radius: 50% 50% 50% 0;
  background: var(--c-paper);
  transform: rotate(-45deg);
}

.progreso__nodo--hecho {
  border-color: #4F7A2E;
  background: var(--c-leaf);
}

.progreso__nodo--actual {
  border-color: var(--c-teal-900);
  background: var(--c-lime);
}

.progreso__ave {
  position: absolute;
  left: -1.25rem;
  bottom: 1.1rem;
  width: 2.5rem;
  height: 1.875rem;
  will-change: transform;
}

.progreso__cuerpo {
  width: 100%;
  height: 100%;
}
</style>
