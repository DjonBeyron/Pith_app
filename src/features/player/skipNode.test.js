import { describe, it, expect } from 'vitest'
import { isSilentNode, skipSilent } from './skipNode.js'

const ref = (id, targetId, then) => ({ id, type: 'lesson_ref', typeData: { lesson_ref: { targetId } }, triggers: then ? [{ if: 'shown', then }] : [] })
const text = id => ({ id, type: 'text', typeData: {}, triggers: [] })
const map = (...nodes) => Object.fromEntries(nodes.map(n => [n.id, n]))

describe('тихие ноды плеера (lesson_ref без урока)', () => {
  it('lesson_ref без targetId — тихая, с targetId и любой другой тип — нет', () => {
    expect(isSilentNode(ref('a', null))).toBe(true)
    expect(isSilentNode(ref('a', ''))).toBe(true)
    expect(isSilentNode({ id: 'a', type: 'lesson_ref', typeData: {} })).toBe(true)
    expect(isSilentNode(ref('a', 'lesson-1'))).toBe(false)
    expect(isSilentNode(text('t'))).toBe(false)
    expect(isSilentNode(undefined)).toBe(false)
  })

  it('обычная нода не пропускается', () => {
    expect(skipSilent(map(text('t')), text('t'))).toEqual({ skipped: false })
    const withUrl = ref('a', 'lesson-1', 't')
    expect(skipSilent(map(withUrl, text('t')), withUrl)).toEqual({ skipped: false })
  })

  it('пустая ссылка ведёт к следующей обычной ноде', () => {
    const a = ref('a', null, 't')
    expect(skipSilent(map(a, text('t')), a)).toEqual({ skipped: true, nextId: 't' })
  })

  it('несколько пустых ссылок подряд — идём до обычной', () => {
    const a = ref('a', null, 'b'), b = ref('b', null, 't')
    expect(skipSilent(map(a, b, text('t')), a)).toEqual({ skipped: true, nextId: 't' })
  })

  it('пустая ссылка в конце урока — nextId: null (урок закончен)', () => {
    const a = ref('a', null)
    expect(skipSilent(map(a), a)).toEqual({ skipped: true, nextId: null })
  })

  it('цикл из пустых ссылок не зависает — считается концом', () => {
    const a = ref('a', null, 'b'), b = ref('b', null, 'a')
    expect(skipSilent(map(a, b), a)).toEqual({ skipped: true, nextId: null })
  })

  it('связь в никуда отдаём плееру как есть (он залогирует и остановится)', () => {
    const a = ref('a', null, 'ghost')
    expect(skipSilent(map(a), a)).toEqual({ skipped: true, nextId: 'ghost' })
  })
})
