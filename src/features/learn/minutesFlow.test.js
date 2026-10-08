import { describe, it, expect } from 'vitest'
import { MINUTE_CHOICES, minutesCopy, THANKS_COPY, TIMING, pickTimeline, afterPickStep } from './minutesFlow.js'
import { CARDS_BY_MINUTES } from '../../shared/lib/memory/dailyPick.js'

describe('minutesFlow', () => {
  it('варианты совпадают с бюджетом карточек', () => {
    expect(MINUTE_CHOICES.every(m => CARDS_BY_MINUTES[m] > 0)).toBe(true)
    expect(Object.keys(CARDS_BY_MINUTES).map(Number)).toEqual(MINUTE_CHOICES)
  })

  it('онбординг объясняет зачем и где поменять, настройки — коротко', () => {
    const first = minutesCopy(true)
    const later = minutesCopy(false)
    expect(first.title).toBe(later.title)
    expect(first.lead).toMatch(/не перегрузим/)
    expect(first.lead).toMatch(/Профиль → ⚙ Настройки → «Повторение»/)
    expect(later.lead).not.toMatch(/Профиль/)
  })

  it('тексты «Спасибо» заполнены', () => {
    expect(THANKS_COPY.title).toMatch(/Спасибо/)
    expect(THANKS_COPY.lead.length).toBeGreaterThan(10)
  })

  it('таймлайн: галочка → затухание → «Спасибо» 1,5–2 с → дальше', () => {
    const t = pickTimeline()
    expect(t.fadeAt).toBe(TIMING.checkMs)
    expect(t.thanksAt).toBe(TIMING.checkMs + TIMING.fadeMs)
    expect(t.fadeAt).toBeLessThan(t.thanksAt)
    expect(t.doneAt - t.thanksAt).toBeGreaterThanOrEqual(1500)
    expect(t.doneAt - t.thanksAt).toBeLessThanOrEqual(2000)
    expect(pickTimeline({ checkMs: 1, fadeMs: 2, thanksMs: 3 })).toEqual({ fadeAt: 1, thanksAt: 3, doneAt: 6 })
  })

  it('что дальше: гостю с входом — «Сохрани прогресс», остальным — закрыть', () => {
    expect(afterPickStep(true, true)).toBe('guest')
    expect(afterPickStep(true, false)).toBe('close')
    expect(afterPickStep(false, true)).toBe('close')
    expect(afterPickStep(false, false)).toBe('close')
  })
})
