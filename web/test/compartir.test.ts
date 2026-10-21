import { describe, expect, it, vi } from 'vitest'
import { compartir, mensajeCompartir, urlEncuesta, urlWhatsApp } from '../src/lib/compartir'

describe('urlEncuesta', () => {
  it('usa origin + pathname, sin query ni hash', () => {
    expect(urlEncuesta({ origin: 'https://serfunorte.com', pathname: '/bigday/' })).toBe('https://serfunorte.com/bigday/')
  })
})

describe('mensajeCompartir', () => {
  it('menciona el evento e incluye el enlace al final', () => {
    const m = mensajeCompartir('https://x.test/e/')
    expect(m).toContain('October Big Day')
    expect(m).toContain('Los Olivos')
    expect(m.endsWith('https://x.test/e/')).toBe(true)
  })
})

describe('urlWhatsApp', () => {
  it('arma https://wa.me/?text= con el texto codificado', () => {
    expect(urlWhatsApp('Hola & ¿qué tal? https://a.b/c?d=1')).toBe(
      'https://wa.me/?text=Hola%20%26%20%C2%BFqu%C3%A9%20tal%3F%20https%3A%2F%2Fa.b%2Fc%3Fd%3D1',
    )
  })
})

describe('compartir', () => {
  const url = 'https://x.test/e/'

  it('usa la Web Share API si existe', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const abrir = vi.fn()
    expect(await compartir(url, { navegador: { share }, abrir })).toBe('nativo')
    expect(share).toHaveBeenCalledWith({ title: expect.any(String), text: mensajeCompartir(''), url })
    expect(abrir).not.toHaveBeenCalled()
  })

  it('si el usuario cancela el diálogo nativo no abre WhatsApp', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }))
    const abrir = vi.fn()
    expect(await compartir(url, { navegador: { share }, abrir })).toBe('cancelado')
    expect(abrir).not.toHaveBeenCalled()
  })

  it('sin Web Share API abre WhatsApp en otra pestaña', async () => {
    const abrir = vi.fn()
    expect(await compartir(url, { navegador: {}, abrir })).toBe('whatsapp')
    expect(abrir).toHaveBeenCalledWith(urlWhatsApp(mensajeCompartir(url)))
  })

  it('si la Web Share API falla por otro motivo, cae a WhatsApp', async () => {
    const share = vi.fn().mockRejectedValue(new TypeError('no permitido'))
    const abrir = vi.fn()
    expect(await compartir(url, { navegador: { share }, abrir })).toBe('whatsapp')
    expect(abrir).toHaveBeenCalledOnce()
  })
})
