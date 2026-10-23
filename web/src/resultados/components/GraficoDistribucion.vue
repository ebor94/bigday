<script setup lang="ts">
// Barras horizontales de una pregunta de opción única (P1–P5). Una sola serie → un solo color, sin leyenda
// (el enunciado la nombra). Cada fila es texto real (opción, conteo y %): es a la vez gráfico y tabla
// accesible; la barra es decorativa (aria-hidden). Largo = parte del total de la pregunta (escala 0–100 %).
import { formatoPct, type ModeloDistribucion } from '../lib/modelo'

defineProps<{ modelo: ModeloDistribucion }>()
const numero = new Intl.NumberFormat('es-CO')
</script>

<template>
  <figure
    class="tarjeta grafico"
    :aria-labelledby="`titulo-${modelo.id}`"
  >
    <figcaption class="grafico__cabecera">
      <span class="grafico__id">{{ modelo.id.toUpperCase() }}</span>
      <h3
        :id="`titulo-${modelo.id}`"
        class="grafico__titulo"
      >
        {{ modelo.titulo }}
      </h3>
      <p class="grafico__nota">
        {{ numero.format(modelo.total) }} respuestas
      </p>
    </figcaption>
    <ul
      role="list"
      class="barras"
    >
      <li
        v-for="f in modelo.filas"
        :key="f.codigo"
        class="barra"
      >
        <span class="barra__etiqueta">{{ f.etiqueta }}</span>
        <span class="barra__fila">
          <span
            class="barra__pista"
            aria-hidden="true"
          >
            <span
              class="barra__relleno"
              :style="{ width: `${f.proporcion * 100}%` }"
            />
          </span>
          <span class="barra__valor">
            <strong>{{ numero.format(f.total) }}</strong><span class="sr-only"> respuestas, </span>
            <span class="barra__pct">{{ formatoPct(f.pct) }}</span>
          </span>
        </span>
      </li>
    </ul>
  </figure>
</template>
