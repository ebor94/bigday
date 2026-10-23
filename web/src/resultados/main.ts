// Entrada de la vista de estadísticas (resultados.html). App aparte de la encuesta: sin aves ni GSAP.
import { createApp } from 'vue'
import ResultadosApp from './ResultadosApp.vue'
import '../styles/tokens.css'
import '../styles/base.css'
import '../styles/ui.css'
import './resultados.css'

createApp(ResultadosApp).mount('#app')
