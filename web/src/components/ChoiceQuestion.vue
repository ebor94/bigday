<script setup lang="ts">
// Pregunta de opción única: tarjetas grandes con letra (A, B, C…), check con pulso al
// elegir y una pequeña bandada que despega desde la opción. Si la pregunta admite "Otro",
// al elegirlo aparece un campo de texto con foco automático (no avanza solo).
// El avance automático (600 ms) y los atajos A–D / 1–5 los orquesta App.
//
// Accesibilidad: `role="radiogroup"` etiquetado por el enunciado, opciones `role="radio"`
// con `aria-checked` y tabulación itinerante (una sola parada; flechas mueven el foco,
// Espacio/Enter eligen).
import { OTRO_MAX, type QUESTIONS } from '@bigday/shared'
import { computed, nextTick, ref, watch } from 'vue'
import { useBirds } from '../composables/useBirds'

type PreguntaUnica = Extract<(typeof QUESTIONS)[number], { type: 'single' }>

const props = defineProps<{
  pregunta: PreguntaUnica
  valor?: string | undefined
  otro?: string | undefined
  /** id del enunciado (h1) que etiqueta el grupo. */
  etiquetaId: string
}>()

const emit = defineEmits<{
  elegir: [codigo: string]
  otro: [texto: string]
}>()

const aves = useBirds()
const botones = ref<HTMLButtonElement[]>([])
const campoOtro = ref<HTMLInputElement | null>(null)
const idOtro = computed(() => `${props.pregunta.id}-otro`)
const textoOtro = computed(() => props.otro ?? '')

const letra = (i: number) => String.fromCharCode(65 + i)

/** Índice con tabindex 0: la opción elegida o, si no hay, la primera. */
const indiceTabulable = computed(() => {
  const i = props.pregunta.options.findIndex((o) => o.code === props.valor)
  return i >= 0 ? i : 0
})

function elegir(indice: number) {
  const opcion = props.pregunta.options[indice]
  const boton = botones.value[indice]
  if (!opcion) return
  if (boton) aves.launchFlock(boton, 4)
  emit('elegir', opcion.code)
}

function moverFoco(e: KeyboardEvent, indice: number) {
  const n = props.pregunta.options.length
  const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
  if (delta === undefined) return
  e.preventDefault()
  botones.value[(indice + delta + n) % n]?.focus()
}

// Al elegir "Otro" el foco pasa al campo de texto.
watch(
  () => props.valor,
  async (nuevo, anterior) => {
    if (nuevo === 'otro' && anterior !== 'otro') {
      await nextTick()
      campoOtro.value?.focus()
    }
  },
)

defineExpose({ elegirIndice: elegir })
</script>

<template>
  <div class="eleccion">
    <div
      class="opciones"
      role="radiogroup"
      :aria-labelledby="etiquetaId"
    >
      <button
        v-for="(opcion, i) in pregunta.options"
        :key="opcion.code"
        ref="botones"
        type="button"
        role="radio"
        :aria-checked="opcion.code === valor"
        :tabindex="i === indiceTabulable ? 0 : -1"
        :class="['opcion', { 'opcion--elegida': opcion.code === valor }]"
        :data-codigo="opcion.code"
        @click="elegir(i)"
        @keydown="moverFoco($event, i)"
      >
        <span
          class="opcion__letra"
          aria-hidden="true"
        >{{ letra(i) }}</span>
        <span class="opcion__texto">{{ opcion.label }}</span>
        <svg
          v-if="opcion.code === valor"
          class="opcion__check"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="12"
            cy="12"
            r="11"
          />
          <path
            d="M7 12.5l3.2 3.2L17 9"
            fill="none"
            stroke="#fff"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div
      v-if="pregunta.allowOther && valor === 'otro'"
      class="otro"
    >
      <label
        class="otro__etiqueta"
        :for="idOtro"
      >Escribe tu respuesta</label>
      <input
        :id="idOtro"
        ref="campoOtro"
        class="otro__campo"
        type="text"
        :maxlength="OTRO_MAX"
        :value="textoOtro"
        autocomplete="off"
        :aria-describedby="`${idOtro}-contador`"
        @input="emit('otro', ($event.target as HTMLInputElement).value)"
      >
      <p
        :id="`${idOtro}-contador`"
        class="contador"
      >
        {{ textoOtro.length }} / {{ OTRO_MAX }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.eleccion {
  display: grid;
  gap: var(--space-4);
}

.opciones {
  display: grid;
  gap: var(--space-3);
}

.opcion {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 56px;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 2px solid var(--border-option);
  border-radius: var(--radius-organic-sm);
  background: var(--surface-option);
  box-shadow: var(--shadow-soft);
  color: var(--c-ink);
  font-size: var(--fs-md);
  line-height: 1.35;
  text-align: left;
  transition: transform var(--dur-fast) var(--ease-out);
}

.opcion:hover {
  transform: translateY(-2px);
}

.opcion:active {
  transform: scale(0.985);
}

.opcion--elegida {
  border-color: var(--c-teal-900);
  background: #EEF6F2;
}

.opcion__letra {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--c-teal-900);
  color: var(--c-white);
  font-family: var(--font-title);
  font-weight: 700;
}

.opcion--elegida .opcion__letra {
  /* Magenta oscurecido: blanco ≈ 6,1:1 (el magenta de marca no llega a AA en texto pequeño). */
  background: #C0134F;
}

.opcion__texto {
  flex: 1;
}

.opcion__check {
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  fill: var(--c-green);
  animation: pulso 420ms var(--ease-out) both;
}

@keyframes pulso {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  60% {
    opacity: 1;
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}

.otro {
  display: grid;
  gap: var(--space-2);
}

.otro__etiqueta {
  font-weight: 700;
  color: var(--c-teal-900);
}

.otro__campo {
  width: 100%;
  min-height: 52px;
  padding: var(--space-3) var(--space-4);
  border: 2px solid var(--c-teal-900);
  border-radius: var(--radius-sm);
  background: var(--c-white);
  color: var(--c-ink);
}

.contador {
  justify-self: end;
  font-size: var(--fs-sm);
  color: var(--c-teal-900);
}
</style>
