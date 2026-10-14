import { describe, it, expect } from 'vitest'
import { makeSnapshot, diffSnapshots, pushVersion, markCommented } from './lessonVersions.js'

const N = (ref, seq, text, type = 'text') => ({ ref, seq, type, data: { content: text } })
const snap = (list, c) => makeSnapshot(list, new Set(c ?? []))

describe('lessonVersions', () => {
  it('по id: изменённая и новая нода помечаются, остальные нет', () => {
    const prev = snap([N('a', 1, 'один'), N('b', 2, 'два'), N('c', 3, 'три')])
    const cur = snap([N('a', 1, 'один'), N('b', 2, 'два!'), N('d', 3, 'вставка'), N('c', 4, 'три')])
    expect([...diffSnapshots(prev, cur)]).toEqual([['b', 'changed'], ['d', 'new']])
  })
  it('комментарий в прошлой версии = изменено, даже если текст тот же', () => {
    const prev = snap([N('a', 1, 'один'), N('b', 2, 'два')], ['b'])
    const cur = snap([N('a', 1, 'один'), N('b', 2, 'два')])
    expect([...diffSnapshots(prev, cur)]).toEqual([['b', 'changed']])
  })
  it('переимпорт (все id другие): вставка сдвигает номера, но помечается только она и правленые', () => {
    const prev = snap([N('a', 1, 'один'), N('b', 2, 'два'), N('c', 3, 'три'), N('d', 4, 'четыре')])
    const cur = snap([N('x1', 1, 'один'), N('x2', 2, 'новое сообщение', 'audio'), N('x3', 3, 'два'), N('x4', 4, 'три!'), N('x5', 5, 'четыре')])
    const m = diffSnapshots(prev, cur)
    expect(m.get('x2')).toBe('new')
    expect(m.get('x4')).toBe('changed')
    expect(m.has('x1') || m.has('x3') || m.has('x5')).toBe(false)
  })
  it('стопка версий: одинаковая не дублируется, хранится не больше шести', () => {
    let v = []
    const s = snap([N('a', 1, 'один')])
    v = pushVersion(v, s); v = pushVersion(v, s)
    expect(v).toHaveLength(1)
    for (let i = 0; i < 8; i++) v = pushVersion(v, snap([N('a', 1, 'текст ' + i)]))
    expect(v).toHaveLength(6)
  })
  it('markCommented ставит флаг у верхней версии', () => {
    const v = markCommented(pushVersion([], snap([N('a', 1, 'x'), N('b', 2, 'y')])), new Set(['b']))
    expect(v[0].items.find(i => i.id === 'b').c).toBe(1)
  })
})
