<script setup lang="ts">
// Últimas frases de P7 (testimonios), más recientes primero. Se pintan SOLO con interpolación de texto
// de Vue ({{ }}): cualquier marcado que alguien escribiera se ve como texto, nunca se interpreta.
import { QUESTIONS } from '@bigday/shared'
import type { FraseModelo } from '../lib/modelo'

defineProps<{ frases: FraseModelo[] }>()
const titulo = QUESTIONS.find((q) => q.id === 'p7')!.title
</script>

<template>
  <section
    class="seccion"
    aria-labelledby="seccion-frases"
  >
    <h2
      id="seccion-frases"
      class="seccion__titulo"
    >
      Frases recientes (P7)
    </h2>
    <p class="seccion__nota">
      {{ titulo }} · últimas {{ frases.length }}
    </p>
    <p
      v-if="frases.length === 0"
      class="tarjeta estado"
    >
      Todavía no hay frases.
    </p>
    <ul
      v-else
      role="list"
      class="frases"
    >
      <li
        v-for="(f, i) in frases"
        :key="i"
        class="tarjeta frase"
      >
        <blockquote class="frase__texto">
          <p>{{ f.texto }}</p>
        </blockquote>
        <time
          v-if="f.fechaTexto"
          class="frase__fecha"
          :datetime="f.fechaIso"
        >{{ f.fechaTexto }}</time>
      </li>
    </ul>
  </section>
</template>
