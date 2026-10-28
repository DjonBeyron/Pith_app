import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Тесты идут в node без DOM — хранилище и window подменяем до импорта модулей
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}
globalThis.window = new EventTarget()
vi.mock('../../../shared/lib/debug.js', () => ({ dbg: vi.fn() }))
vi.mock('../../../shared/api/supabase.js', () => ({ supabase: { auth: { getSession: async () => ({ data: {} }), onAuthStateChange: () => {} } } }))

const { track, onTrack } = await import('../../../shared/lib/analytics/track.js')
const { startLadderTracking, _stopLadderTracking } = await import('./ladderTrack.js')
const { saveLadder, loadLadder } = await import('./ladderStore.js')
const { signalFromEvent } = await import('../../../shared/lib/level/levelSignals.js')

const plan = [
  { id: 'a', difficulty: 1 }, { id: 'b', difficulty: 1 }, { id: 'c', difficulty: 2 },
  { id: 'd', difficulty: 2 }, { id: 'e', difficulty: 3 },
]
const view = (id, ms) => track('feed_view', { module_id: id, ms })

let seen
let offSpy
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  saveLadder({ firstDay: '2026-10-27', shownDay: '2026-10-28', ids: plan.map(s => s.id), tries: 1 })
  seen = []
  offSpy = onTrack((name, props) => { if (name === 'feed_ladder') seen.push(props) })
})
afterEach(() => {
  _stopLadderTracking()
  offSpy()
  vi.useRealTimers()
})

describe('startLadderTracking — события журнала → feed_ladder', () => {
  it('прошёл все 5 шагов: одно событие feed_ladder и done', () => {
    startLadderTracking(plan)
    view('a', 8500); view('b', 9100)
    track('feed_reveal', { module_id: 'c' }); view('c', 1500)
    track('feed_phrase_open', { module_id: 'd' }); view('d', 1200)
    expect(seen).toHaveLength(0)
    view('e', 1800)
    expect(seen).toEqual([{ steps: '1:8500:0,1:9100:0,2:1500:1,2:1200:1,3:1800:0', top: 1, hard: 2 }])
    expect(loadLadder().done).toBe(true)
    view('a', 9000) // дальше слежения нет — повторного события не будет
    expect(seen).toHaveLength(1)
  })

  it('итог читает модель уровня: сигнал ladder с top и hardAt', () => {
    startLadderTracking(plan)
    for (const id of 'ab') view(id, 9000)
    track('feed_reveal', { module_id: 'c' }); view('c', 1500)
    view('d', 1500); view('e', 1500)
    expect(signalFromEvent('feed_ladder', seen[0], { difficultyOf: () => null })).toEqual({ type: 'ladder', top: 1, hardAt: 2 })
  })

  it('страница уходит (pagehide) после 3+ шагов: итог по просмотренному и done', () => {
    startLadderTracking(plan)
    view('a', 9000); view('b', 9000); view('c', 9000)
    window.dispatchEvent(new Event('pagehide'))
    expect(seen).toEqual([{ steps: '1:9000:0,1:9000:0,2:9000:0', top: 2, hard: 0 }])
    expect(loadLadder().done).toBe(true)
  })

  it('ушёл раньше (меньше 3 шагов): событие есть, но лесенка не пройдена — в другой визит покажем ещё', () => {
    startLadderTracking(plan)
    view('a', 9000)
    window.dispatchEvent(new Event('pagehide'))
    expect(seen).toHaveLength(1)
    expect(loadLadder().done).toBe(false)
  })

  it('ушёл, ничего не посмотрев: события нет', () => {
    startLadderTracking(plan)
    window.dispatchEvent(new Event('pagehide'))
    expect(seen).toHaveLength(0)
  })

  it('остановка слежения (размонтирование): события игнорируются', () => {
    const stop = startLadderTracking(plan)
    stop()
    for (const s of plan) view(s.id, 9000)
    window.dispatchEvent(new Event('pagehide'))
    expect(seen).toHaveLength(0)
  })

  it('пустой план: слежения нет', () => {
    startLadderTracking([])
    view('a', 9000)
    window.dispatchEvent(new Event('pagehide'))
    expect(seen).toHaveLength(0)
  })

  it('новый запуск заменяет прежний: события не дублируются', () => {
    startLadderTracking(plan)
    startLadderTracking(plan)
    for (const s of plan) view(s.id, 9000)
    expect(seen).toHaveLength(1)
  })
})
