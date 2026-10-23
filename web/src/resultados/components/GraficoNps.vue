<script setup lang="ts">
// P6: distribución 1–10 en columnas, coloreadas por grupo NPS (divergente: detractores · pasivos neutro ·
// promotores) con leyenda. Las columnas son una imagen con texto alternativo (aria-label con todos los
// números); la tabla equivalente se abre con «Ver tabla».
import { QUESTIONS } from '@bigday/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { COLORES_GRUPO_NPS, ETIQUETA_GRUPO_CORTA, formatoNps, formatoPct, type ModeloNps } from '../lib/modelo'

const props = defineProps<{ modelo: ModeloNps }>()
const titulo = QUESTIONS.find((q) => q.id === 'p6')!.title
const numero = new Intl.NumberFormat('es-CO')
const alternativo = computed(
  () =>
    `Respuestas por valor de 1 a 10: ${props.modelo.barras
      .map((b) => `${b.valor}: ${numero.format(b.total)} (${formatoPct(b.pct)})`)
      .join('; ')}.`,
)

// Al imprimir, la tabla sale siempre: se abre el <details> antes de imprimir y se deja como estaba después.
// (El CSS de impresión también la fuerza con ::details-content donde el navegador lo admite.)
const detalle = ref<HTMLDetailsElement | null>(null)
let abiertoAntes = false
function antesDeImprimir() {
  if (!detalle.value) return
  abiertoAntes = detalle.value.open
  detalle.value.open = true
}
function despuesDeImprimir() {
  if (detalle.value) detalle.value.open = abiertoAntes
}
onMounted(() => {
  window.addEventListener('beforeprint', antesDeImprimir)
  window.addEventListener('afterprint', despuesDeImprimir)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', antesDeImprimir)
  window.removeEventListener('afterprint', despuesDeImprimir)
})
</script>

<template>
  <section
    class="seccion"
    aria-labelledby="seccion-nps"
  >
    <h2
      id="seccion-nps"
      class="seccion__titulo"
    >
      Recomendación (NPS)
    </h2>
    <figure class="tarjeta grafico">
      <figcaption class="grafico__cabecera">
        <span class="grafico__id">P6</span>
        <h3
          id="titulo-p6"
          class="grafico__titulo"
        >
          {{ titulo }}
        </h3>
        <p class="grafico__nota">
          {{ numero.format(modelo.total) }} respuestas · NPS {{ formatoNps(modelo.valor) }} · escala de 1 a 10 (spec §7)
        </p>
      </figcaption>

      <ul
        role="list"
        class="leyenda"
      >
        <li
          v-for="g in [...modelo.grupos].reverse()"
          :key="g.grupo"
          class="leyenda__item"
        >
          <span
            class="leyenda__muestra"
            :style="{ background: COLORES_GRUPO_NPS[g.grupo] }"
            aria-hidden="true"
          />
          {{ g.etiqueta }}
        </li>
      </ul>

      <div
        class="columnas"
        role="img"
        :aria-label="alternativo"
      >
        <div
          v-for="b in modelo.barras"
          :key="b.valor"
          class="columna"
          aria-hidden="true"
          :title="`${b.valor}: ${numero.format(b.total)} (${formatoPct(b.pct)})`"
        >
          <span class="columna__valor">{{ numero.format(b.total) }}</span>
          <span class="columna__area">
            <span
              class="columna__relleno"
              :style="{ height: `${b.proporcion * 100}%`, background: COLORES_GRUPO_NPS[b.grupo] }"
            />
          </span>
          <span class="columna__eje">{{ b.valor }}</span>
        </div>
      </div>

      <details
        ref="detalle"
        class="tabla-detalle"
      >
        <summary>Ver tabla</summary>
        <table class="tabla">
          <caption class="sr-only">
            Respuestas de P6 por valor de 1 a 10
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Valor
              </th>
              <th scope="col">
                Grupo
              </th>
              <th scope="col">
                Respuestas
              </th>
              <th scope="col">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in modelo.barras"
              :key="b.valor"
            >
              <th scope="row">
                {{ b.valor }}
              </th>
              <td>{{ ETIQUETA_GRUPO_CORTA[b.grupo] }}</td>
              <td>{{ numero.format(b.total) }}</td>
              <td>{{ formatoPct(b.pct) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </figure>
  </section>
</template>
