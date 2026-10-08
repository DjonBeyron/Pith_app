import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('ширина пузыря текстового сообщения', () => {
  const css = read('../../styles/player/modules/text-width.css')
  const rule = css.slice(css.indexOf('.playerMsgBubble--text'), css.indexOf('}', css.indexOf('.playerMsgBubble--text')))

  it('пузырь текста и hardWrap шире 78%, но не больше 85%', () => {
    expect(rule).toContain('.playerMsgBubble--hardWrap')
    const w = Number(/max-width:\s*(\d+)%/.exec(rule)?.[1])
    expect(w).toBeGreaterThanOrEqual(80)
    expect(w).toBeLessThanOrEqual(85)
  })

  it('файл подключён после text.css, а hardWrap не задаёт свой max-width', () => {
    const idx = read('../../index.css')
    expect(idx.indexOf('modules/text-width.css')).toBeGreaterThan(idx.indexOf('modules/text.css'))
    const text = read('../../styles/player/modules/text.css')
    const hw = text.slice(text.indexOf('.playerMsgBubble--hardWrap {'))
    expect(hw.slice(0, hw.indexOf('}'))).not.toContain('max-width')
  })

  it('ответы ученика остаются на своей ширине', () => {
    expect(rule).not.toContain('--response')
  })
})
