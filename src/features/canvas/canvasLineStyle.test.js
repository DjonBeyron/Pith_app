import { describe, it, expect } from 'vitest'
import { linkKind, linkColor, LINK_COLORS } from './canvasLineStyle.js'

describe('linkKind — смысл перехода по полю if', () => {
  it('верные ответы всех интерактивных типов — один вид', () => {
    for (const v of ['word_correct', 'phrase_correct', 'photo_correct', 'table_correct']) {
      expect(linkKind(v), v).toBe('correct')
    }
  })

  it('неверные — тоже общий вид', () => {
    for (const v of ['word_wrong', 'phrase_wrong', 'photo_wrong', 'table_wrong']) {
      expect(linkKind(v), v).toBe('wrong')
    }
  })

  it('течение урока — обычный переход', () => {
    for (const v of ['played', 'timer', 'timer_after_play', 'photo_shown', 'reg_submit', 'reg_cancel']) {
      expect(linkKind(v), v).toBe('plain')
    }
  })

  it('id варианта ответа — особый переход', () => {
    expect(linkKind('9f1c2e5a-1234-4aaa-bbbb-000000000000')).toBe('variant')
  })

  it('пустое значение не ломает расчёт', () => {
    expect(linkKind(undefined)).toBe('plain')
    expect(linkKind('')).toBe('plain')
  })
})

describe('linkColor — цвета не путаются между собой', () => {
  it('каждому виду свой цвет', () => {
    const used = new Set(Object.values(LINK_COLORS))
    expect(used.size).toBe(Object.keys(LINK_COLORS).length)
  })

  it('верно и неверно совпадают с цветами ответов в чате', () => {
    expect(linkColor('word_correct')).toBe('#4ade80')
    expect(linkColor('word_wrong')).toBe('#f87171')
  })

  it('обычный переход остаётся фирменным лаймовым, как было раньше', () => {
    expect(linkColor('played')).toBe('#b6fe3b')
  })

  it('всегда возвращается валидный цвет', () => {
    for (const v of ['played', 'word_wrong', 'какой-то-id', undefined]) {
      expect(linkColor(v)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
