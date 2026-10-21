import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import ThanksScreen from '../src/components/ThanksScreen.vue'
import { VIDEO_EVENTO } from '../src/lib/videoEvento'
import type { ModoGracias } from '../src/lib/pantallas'

let app: App | null = null
afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})

async function montar(modo: ModoGracias) {
  const cont = document.createElement('div')
  document.body.appendChild(cont)
  app = createApp({ render: () => h(ThanksScreen, { modo }) })
  app.mount(cont)
  await nextTick()
  return cont
}

describe('ThanksScreen: video del evento', () => {
  it('constante con los textos y URL literales', () => {
    expect(VIDEO_EVENTO.titulo).toBe('¡Así vivimos el 2.º October Big Day Los Olivos!')
    expect(VIDEO_EVENTO.invitacion).toBe('Te invitamos a ver el video del evento en nuestras redes sociales:')
    expect(VIDEO_EVENTO.enlaces).toEqual([
      { nombre: 'Instagram', url: 'https://www.instagram.com/p/DesSPEXihbx/' },
      { nombre: 'Facebook', url: 'https://www.facebook.com/share/v/19ie8bWh3q/' },
    ])
  })

  for (const modo of ['enviada', 'pendiente', 'pendiente_regreso', 'ya_respondiste'] as const) {
    it(`modo ${modo}: muestra el bloque con textos y enlaces`, async () => {
      const cont = await montar(modo)
      const bloque = cont.querySelector('.gracias__video') as HTMLElement
      expect(bloque).not.toBeNull()
      const texto = bloque.textContent ?? ''
      expect(texto).toContain('¡Así vivimos el 2.º October Big Day Los Olivos!')
      expect(texto).toContain('Te invitamos a ver el video del evento en nuestras redes sociales:')
      expect(texto).toContain('Instagram: https://www.instagram.com/p/DesSPEXihbx/')
      expect(texto).toContain('Facebook: https://www.facebook.com/share/v/19ie8bWh3q/')
      const enlaces = [...bloque.querySelectorAll('a')]
      expect(enlaces.map((a) => a.getAttribute('href'))).toEqual([
        'https://www.instagram.com/p/DesSPEXihbx/',
        'https://www.facebook.com/share/v/19ie8bWh3q/',
      ])
      for (const a of enlaces) {
        expect(a.getAttribute('target')).toBe('_blank')
        expect(a.getAttribute('rel')).toBe('noopener noreferrer')
        expect(a.textContent).toBe(a.getAttribute('href'))
      }
      // Emojis decorativos ocultos a lectores de pantalla.
      expect(bloque.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3)
      expect(cont.textContent).not.toContain('Compartir el evento')
    })
  }

  for (const modo of ['no_registrada', 'rechazada', 'enviando'] as const) {
    it(`modo ${modo}: no muestra el bloque`, async () => {
      const cont = await montar(modo)
      expect(cont.querySelector('.gracias__video')).toBeNull()
    })
  }
})
