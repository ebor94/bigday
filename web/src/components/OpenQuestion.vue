<script setup lang="ts">
// Pregunta abierta (P7): textarea con contador. Límites y placeholder de shared.
// Enter envía y Shift+Enter inserta un salto de línea (atajos en App).
import type { QUESTIONS } from '@bigday/shared'
import { computed } from 'vue'

type PreguntaAbierta = Extract<(typeof QUESTIONS)[number], { type: 'open' }>

const props = defineProps<{
  pregunta: PreguntaAbierta
  valor?: string | undefined
  etiquetaId: string
}>()

const emit = defineEmits<{ escribir: [id: PreguntaAbierta['id'], texto: string] }>()

const texto = computed(() => props.valor ?? '')
const largo = computed(() => texto.value.trim().length)
const faltan = computed(() => Math.max(0, props.pregunta.minLength - largo.value))
const idContador = computed(() => `${props.pregunta.id}-contador`)
</script>

<template>
  <div class="abierta">
    <textarea
      class="abierta__campo"
      rows="4"
      :value="texto"
      :maxlength="pregunta.maxLength"
      :aria-labelledby="etiquetaId"
      :aria-describedby="idContador"
      :placeholder="pregunta.placeholder"
      @input="emit('escribir', pregunta.id, ($event.target as HTMLTextAreaElement).value)"
    />
    <p
      :id="idContador"
      class="contador"
    >
      <span v-if="faltan > 0">Mínimo {{ pregunta.minLength }} caracteres (faltan {{ faltan }}) · </span>
      <span>{{ texto.length }} / {{ pregunta.maxLength }}</span>
    </p>
  </div>
</template>

<style scoped>
.abierta {
  display: grid;
  gap: var(--space-2);
}

.abierta__campo {
  width: 100%;
  min-height: 8rem;
  padding: var(--space-3) var(--space-4);
  border: 2px solid var(--c-teal-900);
  border-radius: var(--radius-md);
  background: var(--c-white);
  color: var(--c-ink);
  line-height: 1.45;
  resize: vertical;
}

/* Placeholder con contraste AA sobre blanco (gris azulado ≈ 5,9:1). */
.abierta__campo::placeholder {
  color: #56666B;
  opacity: 1;
}

.contador {
  justify-self: end;
  font-size: var(--fs-sm);
  color: var(--c-teal-900);
  text-align: right;
}
</style>
