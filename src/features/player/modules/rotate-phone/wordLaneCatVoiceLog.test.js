import { describe, it, expect, vi } from 'vitest'
import { openCatVoice, formatCatVoice, audioEnv } from './wordLaneCatVoiceLog.js'
import { createStartTrace } from '../../../../shared/lib/gameStartTrace.js'

// Журнал «[cat-voice] реплика <id>: …» — по строке на каждую реплику кота в первые 15 с игры
function env({ inWindow = true, activation = true, as = 'play-and-record', interrupts = 1, last = 0 } = {}) {
  let now = 1000
  const trace = createStartTrace({ now: () => now, note: vi.fn() })
  if (inWindow) { trace.begin(); now = 1900; trace.mark('settle'); now = 3120 }
  const warm = { status: () => ({ interrupts, lastInterruptAt: last }) }
  const nav = { userActivation: { isActive: activation }, audioSession: { type: as } }
  const log = vi.fn(); const emit = vi.fn()
  return { trace, warm, nav, log, emit }
}
const slot = (over = {}) => ({ exists: true, hasUrl: true, prepared: true, rs: 4, paused: true, wokeAt: 1500, wokeErr: null, ...over })

describe('openCatVoice: строка и событие на реплику', () => {
  it('слот, play() ok: все поля — источник, слот (readyState/prepared/interrupted), исход, жест, тип сессии, мс с тапа и с settle, прерывания', () => {
    const e = env()
    const done = openCatVoice({ id: 'rh_start', source: 'slot', slot: slot() }, e)
    expect(e.log).not.toHaveBeenCalled() // исход play() придёт позже
    done({ play: 'ok', ms: 120 })
    const line = e.log.mock.calls[0][0]
    expect(line).toContain('[cat-voice] реплика rh_start: источник=слот библиотеки')
    expect(line).toContain('readyState=4, prepared=да, interrupted=нет')
    expect(line).toContain('play() → ok (playing пришло), 120 мс')
    expect(line).toContain('userActivation=жив; audioSession.type=play-and-record; с тапа 2120 мс; с settle 1220 мс; прерываний с тапа 1')
    expect(e.emit).toHaveBeenCalledWith('cat-voice', expect.objectContaining({ id: 'rh_start', source: 'slot', play: 'ok', activation: 'alive', as: 'play-and-record', sinceTap: 2120, sinceSettle: 1220, interrupts: 1, slot: expect.objectContaining({ rs: 4, prepared: true, interrupted: false }) }), { quiet: true })
  })

  it('жест истёк, play() отклонён (NotAllowedError), слот прерван после пробуждения: всё в строке', () => {
    const e = env({ activation: false, last: 1800 })
    openCatVoice({ id: 'rh_start', source: 'slot', slot: slot({ wokeAt: 1700 }) }, e)({ play: 'rejected', error: 'NotAllowedError', ms: 4 })
    const line = e.log.mock.calls[0][0]
    expect(line).toContain('play() → отклонён (NotAllowedError)')
    expect(line).toContain('interrupted=да')
    expect(line).toContain('userActivation=истёк')
  })

  it('не заиграл: «не заиграл за 700 мс (нет playing)»; голос системы и «нет озвучки» — отдельные источники с причиной', () => {
    const e = env()
    openCatVoice({ id: 'a', source: 'slot', slot: slot() }, e)({ play: 'no-playing', ms: 700 })
    expect(e.log.mock.calls[0][0]).toContain('не заиграл за 700 мс (нет playing)')
    openCatVoice({ id: 'b', source: 'synth', slot: slot({ prepared: false, rs: 0 }), waitedMs: 1500, why: 'слот не успел за 1500 мс' }, e)({ play: 'ok', ms: 90 })
    const synth = e.log.mock.calls[1][0]
    expect(synth).toContain('источник=голос системы (слот не успел за 1500 мс)')
    expect(synth).toContain('speak() → ok')
    expect(synth).toContain('prepared=нет')
    expect(synth).toContain('ждали слот 1500 мс')
    openCatVoice({ id: 'c', source: 'none', why: 'у реплики нет озвучки (url)' }, e)()
    expect(e.log.mock.calls[2][0]).toContain('источник=нет озвучки (у реплики нет озвучки (url))')
    expect(e.log.mock.calls[2][0]).toContain('слота нет')
    openCatVoice({ id: 'd', source: 'none', noSynth: true, slot: slot({ prepared: false, rs: 0, wokeNote: 'aborted' }), waitedMs: 3000, why: 'слот не успел за 3000 мс' }, e)()
    const silent = e.log.mock.calls[3][0]
    expect(silent).toContain('источник=нет (синтез запрещён) (слот не успел за 3000 мс)')
    expect(silent).toContain('пробуждение прервано (AbortError — не отказ)')
    expect(e.emit).toHaveBeenLastCalledWith('cat-voice', expect.objectContaining({ id: 'd', source: 'none', noSynth: true, slot: expect.objectContaining({ wokeNote: 'aborted' }) }), { quiet: true })
  })

  it('вне первых 15 с (или без тапа) ничего не пишет; повторный done игнорируется; сбой журнала не ломает', () => {
    const late = env({ inWindow: false })
    openCatVoice({ id: 'x', source: 'slot', slot: slot() }, late)({ play: 'ok' })
    expect(late.log).not.toHaveBeenCalled()
    const e = env()
    const done = openCatVoice({ id: 'x', source: 'slot', slot: slot() }, e)
    done({ play: 'ok' }); done({ play: 'rejected' })
    expect(e.log).toHaveBeenCalledTimes(1)
    const bad = env(); bad.log = () => { throw new Error('boom') }
    expect(() => openCatVoice({ id: 'x', source: 'slot', slot: slot() }, bad)({ play: 'ok' })).not.toThrow()
  })

  it('audioEnv: нет userActivation / audioSession (старый iOS) — null, а не падение', () => {
    const e = env()
    expect(audioEnv({ trace: e.trace, warm: e.warm, nav: {} })).toMatchObject({ activation: null, as: null, sinceTap: 2120 })
    expect(formatCatVoice({ id: 'q', source: 'slot', play: 'ok', activation: null })).toContain('userActivation=—; audioSession.type=—')
  })
})
