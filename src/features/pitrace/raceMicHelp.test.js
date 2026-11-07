import { describe, it, expect } from 'vitest'
import { needsMicNote, isStandalone, micHelp, MIC_NOTE_TEXT, MIC_NOTE_MAX_AGE_MS, MIC_HELP_TEXTS, MIC_HELP_TITLES } from './raceMicHelp.js'

// Попап гонки: подсказка до первого диалога микрофона и плашка отказа по режиму (Safari / приложение с «Домой»)
describe('подсказка «iPhone спросит разрешение…»', () => {
  const now = 10 * MIC_NOTE_MAX_AGE_MS
  it('показывается: поток сеанса не жив и не разрешали никогда / больше часа назад', () => {
    expect(needsMicNote({ alive: false, grantedAt: null, now })).toBe(true)
    expect(needsMicNote({ alive: false, grantedAt: now - MIC_NOTE_MAX_AGE_MS - 1, now })).toBe(true)
  })
  it('не показывается: поток уже открыт в этом сеансе или разрешали меньше часа назад', () => {
    expect(needsMicNote({ alive: true, grantedAt: null, now })).toBe(false)
    expect(needsMicNote({ alive: false, grantedAt: now - 1000, now })).toBe(false)
  })
  it('текст короткий и по-русски', () => {
    expect(MIC_NOTE_TEXT).toBe('iPhone спросит разрешение на микрофон один раз за запуск, нажми «Разрешить»')
  })
})

describe('плашка отказа по режиму', () => {
  it('режим по matchMedia(display-mode: standalone) или navigator.standalone', () => {
    expect(isStandalone({ matchMedia: q => ({ matches: q === '(display-mode: standalone)' }) })).toBe(true)
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } })).toBe(true)
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: {} })).toBe(false)
    expect(isStandalone(null)).toBe(false)
    expect(isStandalone({ matchMedia: () => { throw new Error('x') } })).toBe(false)
  })
  it('Safari: абзац про настройки сайта первым; приложение с «Домой» — абзац «открой заново» первым; оба есть всегда', () => {
    const s = micHelp('denied', false)
    expect(s).toMatchObject({ mic: 'denied', mode: 'safari', title: MIC_HELP_TITLES.denied })
    expect(s.paras.map(p => p.id)).toEqual(['safari', 'home']); expect(s.paras[0].current).toBe(true); expect(s.paras[1].current).toBe(false)
    const h = micHelp('unavailable', true)
    expect(h).toMatchObject({ mic: 'unavailable', mode: 'home', title: 'Микрофон не открылся' })
    expect(h.paras.map(p => p.id)).toEqual(['home', 'safari'])
    expect(micHelp('мусор').mic).toBe('unavailable')
  })
  it('тексты: путь в Safari и в Настройках iPhone; для «Домой» — настройки сайта недоступны', () => {
    expect(MIC_HELP_TEXTS.safari).toContain('«⋯» → Настройки веб-сайта → Микрофон → Разрешить')
    expect(MIC_HELP_TEXTS.safari).toContain('Настройки → Приложения → Safari → Настройки для веб-сайтов → Микрофон')
    expect(MIC_HELP_TEXTS.home).toContain('открой его заново и в диалоге нажми «Разрешить»'); expect(MIC_HELP_TEXTS.home).toContain('недоступны')
  })
})
