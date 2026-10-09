import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Страж анимации подсказки «потри фразу» (feed-rub-hint.css): отпечаток ходит по фразе циклом, только transform+opacity
const css = readFileSync(new URL('../../styles/feed-rub-hint.css', import.meta.url), 'utf8')
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
const frames = noComments.match(/@keyframes feedRubFinger\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const rule = noComments.match(/\.feedRubFinger\s*\{([^}]*)\}/)?.[1] ?? ''

describe('feed-rub-hint.css', () => {
  it('одна бесконечная анимация цикла ~3.3 с на отпечатке', () => {
    expect(rule).toMatch(/animation:\s*feedRubFinger\s+3\.3s\s+linear\s+[\d.]+s\s+infinite/)
    expect(rule.match(/animation:/g)).toHaveLength(1)
  })

  it('кадры: translate3d + opacity, три потирания туда-сюда, исчезновение и пауза', () => {
    expect(frames).toContain('translate3d(')
    expect(frames).toContain('opacity')
    expect(frames).not.toMatch(/translateX|translate\(|scale|rotate/)
    const toB = frames.match(/translate3d\(var\(--rf-b\)/g) ?? []
    expect(toB).toHaveLength(3) // три хода до правой точки (и три возврата в левую)
    expect(frames).toMatch(/-3px/)
    expect(frames).toMatch(/\b3px/)
    expect(frames).toMatch(/78\.79%\s*\{\s*opacity:\s*0/)
    expect(frames).toMatch(/100%\s*\{\s*opacity:\s*0/)
  })

  it('без filter / blur / box-shadow, касаний не ловит, will-change только transform и opacity', () => {
    expect(noComments).not.toMatch(/filter|blur|box-shadow|drop-shadow/)
    expect(rule).toMatch(/pointer-events:\s*none/)
    expect(rule).toMatch(/will-change:\s*transform,\s*opacity/)
  })

  it('prefers-reduced-motion: отпечаток без анимации', () => {
    const rm = noComments.slice(noComments.indexOf('prefers-reduced-motion'))
    expect(rm).toMatch(/\.feedRubFinger\s*\{[^}]*animation:\s*none/)
  })
})
