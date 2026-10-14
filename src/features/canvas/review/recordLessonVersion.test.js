import { describe, it, expect, beforeEach } from 'vitest'
import { recordLessonVersion } from './useLessonVersions.js'

const cn = (id, seq, content) => ({ id, seq, type: 'text', typeData: { text: { content } }, triggers: [] })

describe('recordLessonVersion: версии пишутся и вне окна разбора', () => {
  beforeEach(() => {
    const m = new Map()
    globalThis.localStorage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }
  })
  it('состояние до импорта и после — две версии; повтор того же состояния не плодит', () => {
    recordLessonVersion('L1', [cn('a', 1, 'старый')])
    recordLessonVersion('L1', [cn('a', 1, 'старый')])
    recordLessonVersion('L1', [cn('b', 1, 'новый сценарий')])
    expect(JSON.parse(localStorage.getItem('pithy-versions:L1'))).toHaveLength(2)
  })
  it('без урока или без нод ничего не пишет', () => {
    recordLessonVersion(null, [cn('a', 1, 'x')])
    recordLessonVersion('L2', [])
    expect(localStorage.getItem('pithy-versions:L2')).toBeNull()
  })
})
