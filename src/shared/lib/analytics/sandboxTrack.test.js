import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// track(): события песочницы сцены (module_id / scene_id / from / to = '__sandbox__') не попадают в очередь и не уходят
const dbg = vi.hoisted(() => vi.fn())
vi.mock('../debug.js', () => ({ dbg }))
vi.mock('../../api/supabase.js', () => ({ supabase: { auth: { getSession: async () => ({ data: {} }), onAuthStateChange: () => {} } } }))

describe('track — песочница не логируется', () => {
  beforeEach(() => { vi.useFakeTimers(); dbg.mockClear() })
  afterEach(() => vi.useRealTimers())

  const sent = () => dbg.mock.calls.filter(c => c[0] === '[analytics]').map(c => c[1])

  it('события с id песочницы отбрасываются, обычные уходят', async () => {
    const { track } = await import('./track.js')
    track('feed_view', { module_id: '__sandbox__', ms: 3000 })
    track('scene_task_shown', { scene_id: '__sandbox__', kind: 'say' })
    track('feed_swipe', { from: 'a', to: '__sandbox__' })
    await vi.advanceTimersByTimeAsync(11000)
    expect(sent()).toEqual([])
    track('feed_view', { module_id: 'real-1', ms: 3000 })
    await vi.advanceTimersByTimeAsync(11000)
    expect(sent()).toEqual(['feed_view'])
  })
})
