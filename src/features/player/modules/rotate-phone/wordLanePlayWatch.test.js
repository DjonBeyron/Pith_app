import { describe, it, expect, vi } from 'vitest'
import { watchPlay, WATCH_MS } from './wordLanePlayWatch.js'

// Исход play(): принят и зазвучал / отклонён / принят, но 'playing' нет / без ответа
function el() {
  const l = {}
  return {
    readyState: 4,
    addEventListener: (t, f) => { (l[t] ??= new Set()).add(f) },
    removeEventListener: (t, f) => { l[t]?.delete(f) },
    fire: t => [...(l[t] ?? [])].forEach(f => f()),
    count: t => l[t]?.size ?? 0,
  }
}
const tick = () => new Promise(r => setTimeout(r, 0))

describe('watchPlay', () => {
  it('промис принят и пришло playing — ok (в любом порядке), слушатель снят', async () => {
    const a = el(); const out = vi.fn()
    watchPlay(a, Promise.resolve(), out)
    a.fire('playing'); await tick()
    expect(out).toHaveBeenCalledTimes(1)
    expect(out.mock.calls[0][0]).toMatchObject({ play: 'ok', rs: 4 })
    expect(a.count('playing')).toBe(0)
    const b = el(); const out2 = vi.fn()
    watchPlay(b, new Promise(r => setTimeout(r, 5)), out2)
    b.fire('playing')
    expect(out2).not.toHaveBeenCalled() // playing раньше промиса: ждём промис
    await new Promise(r => setTimeout(r, 15))
    expect(out2.mock.calls[0][0].play).toBe('ok')
  })

  it('промис отклонён — rejected с именем ошибки (NotAllowedError: нет жеста)', async () => {
    const a = el(); const out = vi.fn()
    watchPlay(a, Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })), out)
    await tick()
    expect(out.mock.calls[0][0]).toMatchObject({ play: 'rejected', error: 'NotAllowedError' })
  })

  it('промис принят, а playing не пришло за WATCH_MS — no-playing; не ответил ничего — pending; итог один раз', async () => {
    vi.useFakeTimers()
    const a = el(); const out = vi.fn()
    watchPlay(a, Promise.resolve(), out)
    await vi.advanceTimersByTimeAsync(WATCH_MS - 1)
    expect(out).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5)
    expect(out.mock.calls[0][0]).toMatchObject({ play: 'no-playing', ms: expect.any(Number) })
    a.fire('playing')
    expect(out).toHaveBeenCalledTimes(1)
    const b = el(); const out2 = vi.fn()
    watchPlay(b, new Promise(() => {}), out2)
    await vi.advanceTimersByTimeAsync(WATCH_MS + 5)
    expect(out2.mock.calls[0][0].play).toBe('pending')
    vi.useRealTimers()
  })

  it('заглушка без addEventListener (тесты, старые браузеры): доверяем промису; без колбэка ничего не делает', async () => {
    const out = vi.fn()
    watchPlay({ readyState: 2 }, Promise.resolve(), out)
    await tick()
    expect(out.mock.calls[0][0]).toMatchObject({ play: 'ok', rs: 2 })
    expect(() => watchPlay({}, Promise.resolve(), null)).not.toThrow()
    const sync = vi.fn()
    watchPlay({}, undefined, sync) // play() без промиса
    expect(sync.mock.calls[0][0].play).toBe('ok')
  })
})
