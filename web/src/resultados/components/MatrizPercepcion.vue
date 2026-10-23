<script setup lang="ts">
// Cambio de percepción P2 (antes) × P3 (después): el indicador clave de marca (spec §1).
// Escritorio: tabla real (th de fila y de columna) como mapa de calor secuencial de un solo tono; cada celda
// muestra su conteo y el % dentro de su fila, con texto que cumple AA sobre su fondo.
// Móvil (< 760 px): versión compacta sin scroll horizontal: por cada percepción de partida con respuestas,
// solo las combinaciones con respuestas (conteo, % de la fila y barra fina), y un resumen con el total de
// cada opción de P3 y el total general.
// Solo una de las dos versiones se muestra (display: none oculta la otra también a los lectores de pantalla).
import { QUESTIONS } from '@bigday/shared'
import { computed } from 'vue'
import {
  COLORES_CALOR,
  TEXTO_CALOR,
  formatoPct,
  modeloMatrizCompacta,
  type DestacadoPercepcion,
  type ModeloMatriz,
} from '../lib/modelo'

const props = defineProps<{ matriz: ModeloMatriz; destacado: DestacadoPercepcion }>()
const compacta = computed(() => modeloMatrizCompacta(props.matriz))
const tituloP2 = QUESTIONS.find((q) => q.id === 'p2')!.title
const tituloP3 = QUESTIONS.find((q) => q.id === 'p3')!.title
const numero = new Intl.NumberFormat('es-CO')
</script>

<template>
  <section
    class="seccion"
    aria-labelledby="seccion-percepcion"
  >
    <h2
      id="seccion-percepcion"
      class="seccion__titulo"
    >
      Cambio de percepción (P2 → P3)
    </h2>
    <div class="tarjeta grafico">
      <p class="destacado">
        <strong class="destacado__cifra">{{ formatoPct(destacado.pct) }}</strong>
        <span>
          ahora asocia Los Olivos con «{{ destacado.etiquetas[0] }}» o «{{ destacado.etiquetas[1] }}»
          ({{ numero.format(destacado.nueva) }} de {{ numero.format(destacado.total) }}).
        </span>
      </p>
      <p class="destacado destacado--secundario">
        <strong class="destacado__cifra">{{ formatoPct(destacado.desdeCementerio.pct) }}</strong>
        <span>
          de quienes antes lo asociaban con «{{ destacado.etiquetaAntes }}» ahora lo ve así
          ({{ numero.format(destacado.desdeCementerio.nueva) }} de {{ numero.format(destacado.desdeCementerio.total) }}).
        </span>
      </p>

      <dl class="matriz-preguntas">
        <div>
          <dt>Antes (filas, P2)</dt>
          <dd>{{ tituloP2 }}</dd>
        </div>
        <div>
          <dt>Ahora (columnas, P3)</dt>
          <dd>{{ tituloP3 }}</dd>
        </div>
      </dl>

      <div class="matriz-tabla">
        <table class="matriz">
          <caption class="sr-only">
            Respuestas por combinación de percepción antes (P2, filas) y ahora (P3, columnas), con el porcentaje dentro de cada fila
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                class="matriz__esquina"
              >
                Antes ↓ · Ahora →
              </th>
              <th
                v-for="c in matriz.columnas"
                :key="c.codigo"
                scope="col"
              >
                {{ c.etiqueta }}
              </th>
              <th
                scope="col"
                class="matriz__total"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="f in matriz.filas"
              :key="f.codigo"
            >
              <th scope="row">
                {{ f.etiqueta }}
              </th>
              <td
                v-for="c in f.celdas"
                :key="c.codigo"
                class="matriz__celda"
                :style="{ background: COLORES_CALOR[c.nivel], color: TEXTO_CALOR[c.nivel] }"
              >
                <strong>{{ numero.format(c.total) }}</strong>
                <span class="matriz__pct">{{ formatoPct(f.total > 0 ? c.pctFila : null) }}</span>
              </td>
              <td class="matriz__total">
                {{ numero.format(f.total) }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                Total
              </th>
              <td
                v-for="c in matriz.columnas"
                :key="c.codigo"
                class="matriz__total"
              >
                {{ numero.format(c.total) }}
              </td>
              <td class="matriz__total">
                {{ numero.format(matriz.total) }}
              </td>
            </tr>
          </tfoot>
        </table>
        <div
          class="escala"
          aria-hidden="true"
        >
          <span>Menos</span>
          <span
            v-for="(color, i) in COLORES_CALOR"
            :key="i"
            class="escala__paso"
            :style="{ background: color }"
          />
          <span>Más</span>
        </div>
      </div>

      <div class="matriz-lista">
        <div
          v-for="f in compacta.filas"
          :key="f.codigo"
          class="matriz-lista__grupo"
        >
          <h3 class="matriz-lista__titulo">
            <span>Antes: «{{ f.etiqueta }}»</span><span class="sr-only">, </span>
            <span class="matriz-lista__n">{{ numero.format(f.total) }} respuestas</span>
          </h3>
          <ul
            role="list"
            class="compacta"
          >
            <li
              v-for="c in f.celdas"
              :key="c.codigo"
              class="compacta__item"
            >
              <span class="compacta__etiqueta">Ahora: {{ c.etiqueta }}</span>
              <span class="compacta__valor"><strong>{{ numero.format(c.total) }}</strong><span class="sr-only"> respuestas, </span> <span class="barra__pct">{{ formatoPct(c.pctFila) }}</span></span>
              <span
                class="compacta__pista"
                aria-hidden="true"
              >
                <span
                  class="compacta__relleno"
                  :style="{ width: `${(c.total / f.total) * 100}%` }"
                />
              </span>
            </li>
          </ul>
        </div>
        <p
          v-if="compacta.ocultas"
          class="matriz-lista__nota"
        >
          Se omiten las combinaciones sin respuestas.
        </p>
        <div class="matriz-lista__resumen">
          <h3 class="matriz-lista__titulo">
            <span>Ahora (P3), todas las respuestas</span><span class="sr-only">, </span>
            <span class="matriz-lista__n">Total: {{ numero.format(compacta.total) }} respuestas</span>
          </h3>
          <ul
            role="list"
            class="compacta"
          >
            <li
              v-for="c in compacta.columnas"
              :key="c.codigo"
              class="compacta__item compacta__item--resumen"
            >
              <span class="compacta__etiqueta">{{ c.etiqueta }}</span>
              <span class="compacta__valor"><strong>{{ numero.format(c.total) }}</strong><span class="sr-only"> respuestas, </span> <span class="barra__pct">{{ formatoPct(compacta.total > 0 ? c.pct : null) }}</span></span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
