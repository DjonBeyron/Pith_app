import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const mod = read('./AudioModule.jsx')

// «Чат дёргается, когда запускаешь голосовое из истории» — расшифровка
// схлопывалась в ноль и набиралась заново, пузырь проходил через десяток
// высот, и на каждую PlayerBubble двигал ВСЮ ленту.
// Замер до правки: 57 → 57.2 → 58.2 → 60.3 → 63.5 → 69.3 → 76.4 → 85 → 90.
// После: одна высота на весь повтор, размах у всех строк ленты 0.0.
describe('повторный запуск голосового из истории', () => {
  it('текст, показанный целиком, второй раз не набирается', () => {
    expect(mod).toContain('const fullyRevealedRef = useRef(false)')
    expect(mod).toContain('setRevealedCharIdx(fullyRevealedRef.current ? capturedChars.length : -1)')
  })

  it('на повторе цикл кадров не трогает раскрытие', () => {
    // Каждое изменение revealedCharIdx — новая высота пузыря и сдвиг ленты
    expect(mod).toContain('if (capturedChars.length && !fullyRevealedRef.current) {')
  })

  it('флаг ставится там, где текст действительно дошёл до конца', () => {
    const ended = mod.slice(mod.indexOf('function onEnded'))
    const body = ended.slice(0, ended.indexOf('\n    }'))
    expect(body).toContain('setRevealedCharIdx(capturedChars.length)')
    expect(body).toContain('fullyRevealedRef.current = true')
  })

  it('первый прогон печатает как раньше — там рост задуман', () => {
    // Ветка «-1» на месте: на первом прогоне текст по-прежнему набирается
    // в такт речи, и лента едет вместе с ним. Правка касается только повтора
    expect(mod).toContain(': -1)')
    expect(mod).toContain('setTextStarted(true)')
  })
})
