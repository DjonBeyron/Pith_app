import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { subscribeAudioLoss, reportAudioLoss, CONFIRM_MS, GRACE_MS, MUTE_WAIT_MS } from './gameAudioSignals.js'

// Сигналы потери звука без ухода страницы: контекст 'interrupted'/'suspended' не по нашей воле (после resume и CONFIRM_MS) и дорожка микрофона 'ended' / 'mute' → пауза.
// Не сигнал: первые GRACE_MS после старта, «прерывание наше», контекст вернулся сам.
function setup({ since = 10000, self = false } = {}) {
  let ctxCb = null, micCb = null
  const st = { ctx: 'running', mic: 'live' }
  const loss = vi.fn(), resume = vi.fn(), log = vi.fn()
  const off = subscribeAudioLoss(loss, {
    onCtx: cb => { ctxCb = cb; return () => { ctxCb = null } }, ctxState: () => st.ctx, resume,
    onMic: cb => { micCb = cb; return () => { micCb = null } }, micLine: () => st.mic,
    isSelf: () => self, sinceStart: () => since, log,
  })
  const ctx = s => { st.ctx = s; ctxCb?.(s) }
  return { loss, resume, log, off, st, ctx, mic: k => micCb?.(k), has: () => !!ctxCb && !!micCb }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('subscribeAudioLoss', () => {
  it('контекст interrupted и не вернулся за CONFIRM_MS (resume не помог) — пауза ctx-interrupted', () => {
    const t = setup()
    t.ctx('interrupted'); expect(t.resume).toHaveBeenCalledTimes(1); expect(t.loss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(CONFIRM_MS); expect(t.loss).toHaveBeenCalledWith('ctx-interrupted')
  })
  it('suspended не по нашей воле — тоже сигнал', () => {
    const t = setup(); t.ctx('suspended'); vi.advanceTimersByTime(CONFIRM_MS); expect(t.loss).toHaveBeenCalledWith('ctx-suspended')
  })
  it('контекст вернулся в running до подтверждения — паузы нет', () => {
    const t = setup(); t.ctx('interrupted'); vi.advanceTimersByTime(300); t.ctx('running'); vi.advanceTimersByTime(CONFIRM_MS * 2)
    expect(t.loss).not.toHaveBeenCalled()
  })
  it('первые GRACE_MS после старта и «прерывание наше» — не сигнал (в журнале причина)', () => {
    const a = setup({ since: GRACE_MS - 1 }); a.ctx('interrupted'); a.mic('ended'); vi.advanceTimersByTime(CONFIRM_MS * 2)
    expect(a.loss).not.toHaveBeenCalled(); expect(a.log.mock.calls.some(c => c[0].includes('старт игры был'))).toBe(true)
    const b = setup({ self: true }); b.ctx('interrupted'); vi.advanceTimersByTime(CONFIRM_MS * 2)
    expect(b.loss).not.toHaveBeenCalled(); expect(b.log.mock.calls.some(c => c[0].includes('вызвали мы'))).toBe(true)
  })
  it('дорожка микрофона ended — пауза сразу; mute — только если через MUTE_WAIT_MS всё ещё muted', () => {
    const t = setup(); t.mic('ended'); expect(t.loss).toHaveBeenCalledWith('mic-ended')
    const m = setup(); m.st.mic = 'live/muted'; m.mic('mute'); vi.advanceTimersByTime(MUTE_WAIT_MS); expect(m.loss).toHaveBeenCalledWith('mic-mute')
    const u = setup(); u.st.mic = 'live/muted'; u.mic('mute'); u.st.mic = 'live'; vi.advanceTimersByTime(MUTE_WAIT_MS); expect(u.loss).not.toHaveBeenCalled()
    const n = setup(); n.st.mic = 'live/muted'; n.mic('mute'); n.st.mic = 'нет потока'; vi.advanceTimersByTime(MUTE_WAIT_MS); expect(n.loss).toHaveBeenCalledWith('mic-mute') // поток пропал — не «ожила»
  })
  it('reportAudioLoss из кода (сторож дорожки) — пауза у живой подписки, после отписки тишина', () => {
    const t = setup(); reportAudioLoss('mic-dead-ended'); expect(t.loss).toHaveBeenCalledWith('mic-dead-ended')
    t.off(); reportAudioLoss('mic-dead-ended'); expect(t.loss).toHaveBeenCalledTimes(1)
  })
  it('отписка снимает обе подписки и таймеры', () => {
    const t = setup(); t.ctx('interrupted'); t.off(); vi.advanceTimersByTime(CONFIRM_MS * 2)
    expect(t.loss).not.toHaveBeenCalled(); expect(t.has()).toBe(false)
  })
})
