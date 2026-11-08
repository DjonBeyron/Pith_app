import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// v3.3.165: вывод мёртв после всех повторов (звук держит другое приложение — диктовка, звонок) — на попапе SOUND_BUSY_TEXT и авто-повтор раз в AUTO_RETRY_MS (restart с quick: true, без жеста);
// вернулся — ступень продолжается без тапа; нужен тап (tapAgain) — авто-повтор стоп; свернули снова — таймер снят. Хуки React — «как есть» (как wordLanePauseSignals.test.js).
const box = vi.hoisted(() => ({ problem: [] }))
vi.mock('react', async orig => ({
  ...(await orig()),
  useCallback: fn => fn,
  useEffect: fn => { fn() },
  useRef: init => ({ current: init }),
  useState: init => { let v = init; return [v, n => { v = n; if (typeof n === 'string') box.problem.push(n) }] },
}))
vi.mock('./wordLaneStart.js', () => ({ startGameAudio: vi.fn() }))
const logs = vi.hoisted(() => [])
vi.mock('../../../../shared/lib/debug.js', () => ({ pLog: (...a) => logs.push(a.join(' ')) }))

const { useWordLanePause, AUTO_RETRY_MS } = await import('./useWordLanePause.js')
const { SOUND_BUSY_TEXT, TAP_AGAIN_TEXT } = await import('../../../../shared/lib/gameAudioRestart.js')

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
beforeEach(() => {
  vi.useFakeTimers(); logs.length = 0; box.problem.length = 0
  const L = {}
  vi.stubGlobal('document', { visibilityState: 'visible', hasFocus: () => true, addEventListener: (t, h) => { L[t] = h }, removeEventListener: () => {} })
  vi.stubGlobal('window', { addEventListener: (t, h) => { L['w' + t] = h }, removeEventListener: () => {} })
  box.L = L
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function setup(results) {
  const seq = [...results]
  const restart = vi.fn(() => Promise.resolve(seq.shift() ?? { ok: true, mic: 'granted' }))
  const f = { paused: true, pausedIntro: false, pause: vi.fn(() => true), restartStage: vi.fn(), dbg: { event: vi.fn() } }
  const hook = useWordLanePause({ f, cfg: {}, audioSrc: null, lines: null, startAudio: vi.fn(), restart, isVoice: () => true })
  return { restart, f, hook }
}
const DEAD = { ok: false, dead: true, mic: 'granted', busy: 'вывод мёртв и в типе auto — звук держит другое приложение (звонок, запись)', failed: 'x' }

describe('попап паузы: звук занят — причина и авто-повтор', () => {
  it('dead → текст «Звук занят другим приложением…», через 3 с авто-повтор quick; вернулся — ступень без тапа', async () => {
    const { restart, f, hook } = setup([DEAD, { ok: true, mic: 'granted' }])
    hook.resume(); await flush()
    expect(box.problem).toContain(SOUND_BUSY_TEXT); expect(f.pause).toHaveBeenCalledWith('sound-dead')
    expect(logs.some(l => l.startsWith('[audio] авто-повтор через 3 с: вывод мёртв'))).toBe(true)
    expect(restart).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(AUTO_RETRY_MS - 1); expect(restart).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1); await flush()
    expect(restart).toHaveBeenCalledTimes(2); expect(restart.mock.calls[1][0]).toMatchObject({ quick: true })
    expect(restart.mock.calls[0][0].quick).toBeUndefined() // тап — полный путь
    expect(f.restartStage).toHaveBeenCalledTimes(1)
  })
  it('авто-повтор упёрся в жест (tapAgain) — повторы стоп, на попапе «Нажми „Продолжить“ ещё раз»', async () => {
    const { restart, hook } = setup([DEAD, { ok: false, tapAgain: true }])
    hook.resume(); await flush()
    await vi.advanceTimersByTimeAsync(AUTO_RETRY_MS); await flush()
    expect(box.problem.at(-1)).toBe(TAP_AGAIN_TEXT)
    await vi.advanceTimersByTimeAsync(AUTO_RETRY_MS * 5); expect(restart).toHaveBeenCalledTimes(2)
  })
  it('свернули снова, пока ждём авто-повтор, — таймер снят, повтора нет', async () => {
    const { restart, hook } = setup([DEAD])
    hook.resume(); await flush()
    box.L.wpagehide()
    await vi.advanceTimersByTimeAsync(AUTO_RETRY_MS * 3); expect(restart).toHaveBeenCalledTimes(1)
  })
})
