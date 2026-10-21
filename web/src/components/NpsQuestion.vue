<script setup lang="ts">
// Escala 1–10 (P6): 10 botones en dos filas en móvil (1–5 / 6–10) y una fila en escritorio,
// con gradiente rojo → ámbar → verde (colores con AA en lib/colores-nps). Un pajarito se
// posa sobre el número elegido. Los atajos 1–9 y 0 (=10) los orquesta App.
//
// El ave posada no sigue los `transform` (solo scroll/resize): por eso se posa cuando la
// pantalla está `estable` (terminó la transición) y se libera al salir.
import type { QUESTIONS } from '@bigday/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useBirds } from '../composables/useBirds'
import { COLORES_NPS, TEXTO_NPS } from '../lib/colores-nps'

type PreguntaEscala = Extract<(typeof QUESTIONS)[number], { type: 'scale' }>

const props = defineProps<{
  pregunta: PreguntaEscala
  valor?: number | undefined
  etiquetaId: string
  /** La pantalla terminó de entrar (ya no se mueve). */
  estable: boolean
}>()

const emit = defineEmits<{ elegir: [id: PreguntaEscala['id'], valor: number] }>()

const aves = useBirds()
const botones = ref<HTMLButtonElement[]>([])
const numeros = computed(() =>
  Array.from({ length: props.pregunta.max - props.pregunta.min + 1 }, (_, i) => props.pregunta.min + i),
)
const indiceTabulable = computed(() => (props.valor === undefined ? 0 : numeros.value.indexOf(props.valor)))

let liberarPosada: (() => void) | null = null

function posar() {
  liberarPosada?.()
  liberarPosada = null
  if (!props.estable || props.valor === undefined) return
  const boton = botones.value[numeros.value.indexOf(props.valor)]
  if (boton) liberarPosada = aves.perchAt(boton, { color: 'vermilion' })
}

watch(() => [props.valor, props.estable] as const, posar, { flush: 'post', immediate: true })
onBeforeUnmount(() => liberarPosada?.())

function elegir(valor: number) {
  const boton = botones.value[numeros.value.indexOf(valor)]
  if (boton) aves.launchFlock(boton, 3)
  emit('elegir', props.pregunta.id, valor)
}

function moverFoco(e: KeyboardEvent, indice: number) {
  const n = numeros.value.length
  const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
  if (delta === undefined) return
  e.preventDefault()
  botones.value[(indice + delta + n) % n]?.focus()
}

function estilo(i: number) {
  return { '--nps-fondo': COLORES_NPS[i % COLORES_NPS.length], '--nps-texto': TEXTO_NPS }
}

defineExpose({ elegirValor: elegir })
</script>

<template>
  <div class="nps">
    <div
      class="nps__botones"
      role="radiogroup"
      :aria-labelledby="etiquetaId"
      :aria-describedby="`${pregunta.id}-extremos`"
    >
      <button
        v-for="(n, i) in numeros"
        :key="n"
        ref="botones"
        type="button"
        role="radio"
        :aria-checked="n === valor"
        :tabindex="i === indiceTabulable ? 0 : -1"
        :class="['nps__boton', { 'nps__boton--elegido': n === valor }]"
        :style="estilo(i)"
        :data-valor="n"
        @click="elegir(n)"
        @keydown="moverFoco($event, i)"
      >
        {{ n }}
      </button>
    </div>
    <p
      :id="`${pregunta.id}-extremos`"
      class="nps__extremos"
    >
      <span><span class="sr-only">{{ pregunta.min }} = </span>{{ pregunta.minLabel }}</span>
      <span><span class="sr-only">{{ pregunta.max }} = </span>{{ pregunta.maxLabel }}</span>
    </p>
  </div>
</template>

<style scoped>
.nps {
  display: grid;
  gap: var(--space-3);
  /* Espacio para el pajarito posado sobre la primera fila. */
  padding-top: var(--space-5);
}

.nps__botones {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-5) var(--space-2);
}

.nps__boton {
  min-height: 56px;
  padding: 0;
  border: 2px solid rgb(30 42 46 / 0.18);
  border-radius: var(--radius-organic-sm);
  background: var(--nps-fondo);
  box-shadow: var(--shadow-soft);
  color: var(--nps-texto);
  font-family: var(--font-title);
  font-weight: 700;
  font-size: var(--fs-lg);
}

.nps__boton:hover {
  border-color: rgb(30 42 46 / 0.45);
}

/* Elegido: anillo de tinta, sin `transform`. El ave posada se coloca con el rect del botón
   y no sigue transformaciones (solo scroll/resize): un escalado la dejaría desplazada. */
.nps__boton--elegido,
.nps__boton--elegido:hover {
  border-color: var(--c-ink);
  box-shadow: 0 0 0 2px var(--c-ink), var(--shadow-soft);
}

.nps__extremos {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--c-teal-900);
}

@media (min-width: 640px) {
  .nps__botones {
    grid-template-columns: repeat(10, minmax(0, 1fr));
  }
}
</style>
