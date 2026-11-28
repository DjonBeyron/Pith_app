import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Попап «Комментарий к логам»: на смартфоне клавиатура не вылезает сразу — поле не получает фокус при открытии (владелец 2026-11-28)
describe('SendLogPopup: без автофокуса', () => {
  const src = readFileSync(new URL('./SendLogPopup.jsx', import.meta.url), 'utf8')
  it('нет el.focus() и autoFocus при монтировании', () => {
    expect(src).not.toMatch(/\.focus\(\)/)
    expect(src).not.toMatch(/autoFocus/)
  })
  it('при закрытии поле по-прежнему теряет фокус (blur)', () => { expect(src).toMatch(/\.blur\(\)/) })
})
