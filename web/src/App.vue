<script setup lang="ts">
// Flujo completo de la encuesta: bienvenida → P1…P7 → gracias.
// App orquesta: estado (useSurvey), envío (useOutbox), atajos de teclado, avance automático,
// transiciones GSAP entre pantallas y foco. Las pantallas solo presentan y emiten.
import { QUESTIONS } from '@bigday/shared'
import gsap from 'gsap'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BirdLayer from './components/BirdLayer.vue'
import BranchProgress from './components/BranchProgress.vue'
import ChoiceQuestion from './components/ChoiceQuestion.vue'
import NpsQuestion from './components/NpsQuestion.vue'
import OpenQuestion from './components/OpenQuestion.vue'
import QuestionCard from './components/QuestionCard.vue'
import QuestionNav from './components/QuestionNav.vue'
import ThanksScreen from './components/ThanksScreen.vue'
import WatercolorBackground from './components/WatercolorBackground.vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import { useBirds } from './composables/useBirds'
import { useOutbox, type ResultadoEnvio } from './composables/useOutbox'
import { useReducedMotion } from './composables/useReducedMotion'
import { useSurvey, type IdPregunta, type Paso } from './composables/useSurvey'
import { accionTecla, teclaDe, type ContextoTeclado } from './lib/atajos'
import { ID_TITULO, modoGracias, pantallaDe } from './lib/pantallas'

/** Avance automático tras elegir una opción (spec §5). */
const AVANCE_MS = 600

const survey = useSurvey()
const outbox = useOutbox()
const aves = useBirds()
const reducido = useReducedMotion()

// ── Estado de la pantalla de gracias ──
/** Al abrir ya había respondido (o hay envíos pendientes): se muestra "ya respondiste". */
const regreso = ref(outbox.yaRespondio.value || outbox.pendientes.value > 0)
const enviando = ref(false)
const resultado = ref<ResultadoEnvio | null>(null)

const pasoVisible = computed<Paso>(() => (regreso.value ? 'gracias' : survey.paso.value))
const pantalla = computed(() => pantallaDe(pasoVisible.value))
const pregunta = computed(() => {
  const p = pantalla.value
  return p.tipo === 'opcion' || p.tipo === 'escala' || p.tipo === 'abierta' ? p.pregunta : null
})
const modo = computed(() =>
  modoGracias({
    regreso: regreso.value,
    enviando: enviando.value,
    resultado: resultado.value,
    yaRespondio: outbox.yaRespondio.value,
    pendientes: outbox.pendientes.value,
  }),
)
const esUltima = computed(() => pregunta.value?.id === QUESTIONS[QUESTIONS.length - 1]!.id)

/** Valor guardado como texto (código de opción o respuesta libre). */
function texto(clave: keyof typeof survey.respuestas): string | undefined {
  const v = survey.respuestas[clave]
  return typeof v === 'string' ? v : undefined
}
function textoOtro(id: IdPregunta): string | undefined {
  return id === 'p3' || id === 'p4' ? texto(`${id}_otro`) : undefined
}
function numero(clave: IdPregunta): number | undefined {
  const v = survey.respuestas[clave]
  return typeof v === 'number' ? v : undefined
}

/** La pantalla terminó de entrar; false durante la salida y la entrada de una transición. */
const estable = ref(true)

// ── Avance automático ──
let temporizador: ReturnType<typeof setTimeout> | null = null
function cancelarAvance() {
  if (temporizador !== null) clearTimeout(temporizador)
  temporizador = null
}

// ── Acciones ──
const pantallaActual = ref<{ elegirIndice?: (i: number) => void; elegirValor?: (n: number) => void } | null>(null)

function comenzar() {
  survey.comenzar()
}

/**
 * ¿La emisión viene de la pregunta del paso actual? Durante la transición de salida la tarjeta
 * anterior sigue en pantalla: lo que emita no debe aplicarse a la pregunta nueva.
 */
const esDelPaso = (id: IdPregunta) => id === survey.paso.value

function elegirOpcion(id: IdPregunta, codigo: string) {
  if (!esDelPaso(id)) return
  survey.responder(id, codigo)
  cancelarAvance()
  if (codigo !== 'otro') temporizador = setTimeout(avanzar, AVANCE_MS)
}

function elegirValor(id: IdPregunta, valor: number) {
  if (!esDelPaso(id)) return
  survey.responder(id, valor)
  cancelarAvance()
  temporizador = setTimeout(avanzar, AVANCE_MS)
}

function escribir(id: IdPregunta, valor: string) {
  if (esDelPaso(id)) survey.responder(id, valor)
}

function responderOtro(id: IdPregunta, valor: string) {
  if (esDelPaso(id) && (id === 'p3' || id === 'p4')) survey.responderOtro(id, valor)
}

/** Valida y avanza. Con "Otro" validado, la bandada despega desde la tarjeta. */
function avanzar() {
  cancelarAvance()
  if (enviando.value) return
  const actual = survey.paso.value
  const conOtro = (actual === 'p3' || actual === 'p4') && survey.respuestas[actual] === 'otro'
  const tarjeta = document.querySelector(`[data-pregunta="${actual}"]`)
  if (!survey.siguiente()) return
  if (conOtro && tarjeta) aves.launchFlock(tarjeta, 4)
  if (survey.paso.value === 'gracias') void enviarRespuesta()
}

/** "Continuar" / Enter del usuario: se ignora mientras la pantalla se está moviendo. */
function continuar() {
  if (estable.value) avanzar()
}

function atras() {
  if (!estable.value) return
  cancelarAvance()
  survey.atras()
}

async function enviarRespuesta() {
  enviando.value = true
  resultado.value = null
  const construida = survey.construirRespuesta()
  if (!construida.ok) {
    resultado.value = { estado: 'rechazada', mensaje: 'Falta completar alguna respuesta. Revísalas, por favor.' }
  } else {
    resultado.value = await outbox.enviar(construida.datos)
  }
  enviando.value = false
}

/** Rechazada por el servidor: vuelve a P7 sin perder lo respondido. */
function revisar() {
  resultado.value = null
  survey.irA(QUESTIONS[QUESTIONS.length - 1]!.id)
}

function responderDeNuevo() {
  outbox.permitirOtraRespuesta()
  survey.reiniciar()
  resultado.value = null
  regreso.value = false
}

// ── Teclado ──
function contextoTeclado(): ContextoTeclado | null {
  const q = pregunta.value
  if (!q) return null
  if (q.type === 'single') return { tipo: 'single', opciones: q.options.length }
  if (q.type === 'scale') return { tipo: 'scale', min: q.min, max: q.max }
  return { tipo: 'open' }
}

function alPulsarTecla(e: KeyboardEvent) {
  const ctx = contextoTeclado()
  if (!ctx || e.defaultPrevented || e.isComposing) return
  const accion = accionTecla(teclaDe(e), ctx)
  if (!accion) return
  e.preventDefault()
  if (accion.tipo === 'soltarFoco') {
    if (e.target instanceof HTMLElement) e.target.blur()
    return
  }
  // Durante la transición la pantalla anterior aún se ve: no se elige, ni avanza, ni vuelve.
  if (!estable.value) return
  if (accion.tipo === 'elegir') pantallaActual.value?.elegirIndice?.(accion.indice)
  else if (accion.tipo === 'valor') pantallaActual.value?.elegirValor?.(accion.valor)
  else if (accion.tipo === 'continuar') continuar()
  else atras()
}

// ── Transiciones (GSAP: slide + fade + leve rotación; reduced-motion → fundido corto) ──
let direccion = 1
let enfocarAlEntrar = false
const ORDEN: readonly Paso[] = ['bienvenida', ...QUESTIONS.map((q) => q.id), 'gracias']

watch(pasoVisible, (nuevo, anterior) => {
  direccion = ORDEN.indexOf(nuevo) >= ORDEN.indexOf(anterior) ? 1 : -1
  enfocarAlEntrar = true
  cancelarAvance()
})

function alSalir(el: Element, hecho: () => void) {
  estable.value = false
  cancelarAvance()
  if (reducido.value) {
    gsap.to(el, { opacity: 0, duration: 0.12, onComplete: hecho })
    return
  }
  gsap.to(el, {
    opacity: 0,
    x: -70 * direccion,
    rotation: -2.5 * direccion,
    duration: 0.28,
    ease: 'power2.in',
    onComplete: hecho,
  })
}

function alEntrar(el: Element, hecho: () => void) {
  window.scrollTo({ top: 0, behavior: 'instant' })
  const fin = () => {
    gsap.set(el, { clearProps: 'transform,opacity' })
    hecho()
  }
  if (reducido.value) {
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15, onComplete: fin })
    return
  }
  gsap.fromTo(
    el,
    { opacity: 0, x: 70 * direccion, rotation: 2.5 * direccion },
    { opacity: 1, x: 0, rotation: 0, duration: 0.45, ease: 'power3.out', onComplete: fin },
  )
}

async function trasEntrar() {
  estable.value = true
  if (!enfocarAlEntrar) return
  enfocarAlEntrar = false
  await nextTick()
  document.getElementById(ID_TITULO)?.focus({ preventScroll: true })
}

onMounted(() => {
  aves.startAmbient()
  window.addEventListener('keydown', alPulsarTecla)
})

onBeforeUnmount(() => {
  cancelarAvance()
  aves.stopAmbient()
  window.removeEventListener('keydown', alPulsarTecla)
})
</script>

<template>
  <WatercolorBackground />
  <BirdLayer />

  <main class="flujo">
    <BranchProgress
      v-if="pregunta"
      class="flujo__progreso"
      :indice="survey.progreso.value.indice"
      :total="survey.progreso.value.total"
    />

    <Transition
      :css="false"
      mode="out-in"
      @leave="alSalir"
      @enter="alEntrar"
      @after-enter="trasEntrar"
    >
      <WelcomeScreen
        v-if="pantalla.tipo === 'bienvenida'"
        key="bienvenida"
        @comenzar="comenzar"
      />

      <ThanksScreen
        v-else-if="pantalla.tipo === 'gracias'"
        key="gracias"
        :modo="modo"
        :mensaje="resultado?.mensaje"
        @revisar="revisar"
        @otra-vez="responderDeNuevo"
      />

      <QuestionCard
        v-else-if="pregunta"
        :key="pregunta.id"
        class="flujo__pregunta"
        :data-pregunta="pregunta.id"
      >
        <template #header>
          <p class="flujo__numero">
            Pregunta {{ survey.progreso.value.indice }} de {{ survey.progreso.value.total }}
          </p>
          <h1
            :id="ID_TITULO"
            class="flujo__titulo"
            tabindex="-1"
          >
            {{ pregunta.title }}
          </h1>
        </template>

        <ChoiceQuestion
          v-if="pantalla.tipo === 'opcion'"
          ref="pantallaActual"
          :pregunta="pantalla.pregunta"
          :valor="texto(pantalla.pregunta.id)"
          :otro="textoOtro(pantalla.pregunta.id)"
          :etiqueta-id="ID_TITULO"
          @elegir="elegirOpcion"
          @otro="responderOtro"
        />
        <NpsQuestion
          v-else-if="pantalla.tipo === 'escala'"
          ref="pantallaActual"
          :pregunta="pantalla.pregunta"
          :valor="numero(pantalla.pregunta.id)"
          :etiqueta-id="ID_TITULO"
          :estable="estable"
          @elegir="elegirValor"
        />
        <OpenQuestion
          v-else-if="pantalla.tipo === 'abierta'"
          :pregunta="pantalla.pregunta"
          :valor="texto(pantalla.pregunta.id)"
          :etiqueta-id="ID_TITULO"
          @escribir="escribir"
        />

        <QuestionNav
          :error="survey.error.value"
          :texto-continuar="esUltima ? 'Enviar' : 'Continuar'"
          @atras="atras"
          @continuar="continuar"
        />
      </QuestionCard>
    </Transition>
  </main>
</template>

<style scoped>
.flujo {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  min-height: 100vh;
  min-height: 100dvh;
  padding: var(--space-5) var(--gutter) var(--space-8);
}

.flujo__numero {
  margin-bottom: var(--space-2);
  font-size: var(--fs-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c-teal-900);
}

.flujo__titulo {
  font-size: clamp(1.375rem, 1.1rem + 1.1vw, 1.875rem);
  line-height: 1.2;
  color: var(--c-teal-900);
}

.flujo__titulo:focus {
  outline: none;
}

@media (min-width: 960px) {
  .flujo {
    padding-top: var(--space-7);
  }
}
</style>
