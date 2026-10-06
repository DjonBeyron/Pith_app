import { describe, it, expect } from 'vitest'
import { ANCHOR_ALL, FEED_PAGE, FEED_WINDOW, entryKey, olderAnchor, windowStart } from './feedWindow.js'

const node = id => ({ kind: 'node', node: { id } })
const sig  = key => ({ kind: 'signal', key, node: { id: 'sig-' + key } })
const list = n => Array.from({ length: n }, (_, i) => node('n' + i))

describe('feedWindow', () => {
  it('ключ записи: нода — id, сигнал — свой key', () => {
    expect(entryKey(node('a'))).toBe('a')
    expect(entryKey(sig('s1'))).toBe('s1')
  })

  it('без якоря рендерится только хвост FEED_WINDOW', () => {
    expect(windowStart(list(5), null)).toBe(0)
    expect(windowStart(list(FEED_WINDOW), null)).toBe(0)
    expect(windowStart(list(50), null)).toBe(50 - FEED_WINDOW)
  })

  it('якорь по ключу открывает ленту до этой записи, ANCHOR_ALL — всё', () => {
    const e = list(50)
    expect(windowStart(e, 'n20')).toBe(20)
    expect(windowStart(e, ANCHOR_ALL)).toBe(0)
  })

  it('пропавший якорь (шаг назад удалил ноду) → снова хвост', () => {
    expect(windowStart(list(50), 'nope')).toBe(50 - FEED_WINDOW)
  })

  it('якорь никогда не прячет хвост: новые сообщения всегда видны', () => {
    // якорь на n45, а хвост начинается с n38 → показываем с n38
    expect(windowStart(list(50), 'n45')).toBe(50 - FEED_WINDOW)
  })

  it('клик «показать раньше» поднимает якорь на FEED_PAGE записей, до начала — ANCHOR_ALL', () => {
    const e = list(50)
    const s0 = windowStart(e, null)                // 38
    const a1 = olderAnchor(e, s0)                  // n30
    expect(a1).toBe('n' + (s0 - FEED_PAGE))
    const s1 = windowStart(e, a1)
    expect(s1).toBe(s0 - FEED_PAGE)
    expect(olderAnchor(e, FEED_PAGE)).toBe(ANCHOR_ALL)
    expect(olderAnchor(e, FEED_PAGE - 3)).toBe(ANCHOR_ALL)
  })

  it('сигналы считаются записями окна наравне с нодами', () => {
    const e = [...list(20), sig('s1'), ...list(5).map(x => node(x.node.id + 'b'))]
    const start = windowStart(e, null)
    expect(e.slice(start).some(x => x.kind === 'signal')).toBe(true)
  })
})
