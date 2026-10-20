import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { settleSceneIdle, SETTLE_CLASS, SETTLE_MS, SETTLE_PARTS } from './sceneSettle.js'

// Подделка элемента: style, classList, querySelectorAll по классам
function fakeEl(cls) {
  const classes = new Set(cls.split(' '))
  return {
    style: {}, classes,
    classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c) },
  }
}
function fakeRoot(parts) {
  const root = fakeEl('scn scn--live')
  root.querySelectorAll = sel => parts.filter(p => sel.split(',').some(s => p.classList.contains(s.trim().slice(1))))
  return root
}

describe('успокоение позы перед заморозкой кадра (sceneSettle.js)', () => {
  it('поза фиксируется инлайном, класс settle ставится, следующим кадром инлайн отпускается', () => {
    const head = fakeEl('cat-head'), body = fakeEl('cat-body'), steam = fakeEl('prop-steam'), other = fakeEl('cat-mouth')
    const root = fakeRoot([head, body, steam, other])
    let frame = null
    const getStyle = el => (el === head ? { transform: 'matrix(1, 0.1, -0.1, 1, 0, 0)' } : el === steam ? { transform: 'matrix(1,0,0,1,0,-2)', opacity: '0.6' } : { transform: 'none' })
    const onDone = vi.fn()
    const cancel = settleSceneIdle(root, { getStyle, raf: cb => { frame = cb }, onDone })
    expect(head.style.transform).toBe('matrix(1, 0.1, -0.1, 1, 0, 0)')
    expect(body.style.transform).toBe('none')
    expect(steam.style.opacity).toBe('0.6')
    expect(other.style.transform).toBeUndefined() // не из списка частей
    expect(root.classList.contains(SETTLE_CLASS)).toBe(true)
    frame()
    expect(head.style.transform).toBe('')
    expect(steam.style.opacity).toBe('')
    expect(onDone).toHaveBeenCalledWith(3)
    cancel()
    expect(root.classList.contains(SETTLE_CLASS)).toBe(false)
  })

  it('отмена до кадра: кадр не отпускает инлайн сам, всё снимается отменой', () => {
    const head = fakeEl('cat-head')
    const root = fakeRoot([head])
    let frame = null
    const cancel = settleSceneIdle(root, { getStyle: () => ({ transform: 'matrix(1,0,0,1,1,1)' }), raf: cb => { frame = cb } })
    cancel()
    expect(head.style.transform).toBe('')
    expect(root.classList.contains(SETTLE_CLASS)).toBe(false)
    frame() // поздний кадр — ничего не делает
    expect(head.style.transform).toBe('')
  })

  it('без корня — пустая отмена', () => {
    expect(() => settleSceneIdle(null)()).not.toThrow()
  })

  it('CSS: у .scn--settle анимации частей сняты и стоит transition той же длины SETTLE_MS; части — те же, что в списке', () => {
    const css = readFileSync(new URL('./scene-v2-cat.css', import.meta.url), 'utf8')
    const rule = css.match(/\.scn--settle[^{]*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).toMatch(/animation:\s*none/)
    expect(rule[1]).toContain(`${SETTLE_MS}ms`)
    for (const part of SETTLE_PARTS.split(',').map(s => s.trim())) expect(rule[0]).toContain(part)
  })
})
