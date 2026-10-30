import { describe, it, expect, vi } from 'vitest'
import { openCatVoice, formatCatVoice } from './wordLaneCatVoiceLog.js'
import { diagnoseFirstLine, silentDiagLines, CAUSE_TITLE } from './wordLaneSilentDiag.js'
import { createStartTrace } from '../../../../shared/lib/gameStartTrace.js'

// Диагностика буферного пути (Web Audio): источник «буфер», итог «started at +N мс», причины «контекст не running» / «буфера нет»; случай владельца (rs=0, play() висит) — для старого пути остаётся «play() принят, но звук не заиграл»
function env() {
  let now = 1000
  const trace = createStartTrace({ now: () => now, note: vi.fn() })
  trace.begin(); now = 1900; trace.mark('settle'); now = 3120
  return { trace, warm: { status: () => ({ interrupts: 0, lastInterruptAt: 0 }) }, nav: { userActivation: { isActive: true }, audioSession: { type: 'play-and-record' } }, log: vi.fn(), emit: vi.fn() }
}
const bufSlot = (over = {}) => ({ exists: true, hasUrl: true, prepared: true, buffer: true, ms: 1800, ctx: 'running', rs: null, paused: null, wokeAt: 0, wokeErr: null, ...over })

describe('журнал «[cat-voice]» для буфера', () => {
  it('источник=буфер Web Audio, длина буфера, ctx; «start() → started at +N мс»', () => {
    const e = env()
    const done = openCatVoice({ id: 'rh_warmup', source: 'buffer', slot: bufSlot() }, e)
    done({ play: 'started', ms: 3, ctx: 'running', source: 'buffer' })
    const line = e.log.mock.calls[0][0]
    expect(line).toContain('источник=буфер Web Audio')
    expect(line).toContain('буфер: 1800 мс, ctx=running')
    expect(line).toContain('start() → started at +3 мс')
    expect(line).not.toContain('readyState') // у буфера нет readyState
    expect(e.emit).toHaveBeenCalledWith('cat-voice', expect.objectContaining({ source: 'buffer', play: 'started', playMs: 3, slot: expect.objectContaining({ buffer: true, ms: 1800, ctx: 'running' }) }), { quiet: true })
  })

  it('контекст не запустился: «контекст не запущен» с текстом ошибки', () => {
    const line = formatCatVoice({ id: 'x', source: 'buffer', slot: { buffer: true, ms: 900, ctx: 'interrupted' }, play: 'ctx-stuck', error: 'AudioContext не запущен (interrupted)', playMs: 300, activation: 'alive', as: 'play-and-record' })
    expect(line).toContain('start() → контекст не запущен (AudioContext не запущен (interrupted)), 300 мс')
  })

  it('старый <audio>-путь печатается как раньше (readyState, play() → …)', () => {
    const line = formatCatVoice({ id: 'x', source: 'slot', slot: { rs: 0, prepared: true, interrupted: false }, play: 'pending', playMs: 700 })
    expect(line).toContain('readyState=0')
    expect(line).toContain('play() → без ответа за 700 мс')
  })
})

describe('«Почему первая реплика тихая» для буфера', () => {
  const mk = (t, kind, d = {}) => ({ t, type: 'probe', kind, ...d })
  const marks = [mk(-2000, 'start-mark', { name: 'tap', sinceTap: 0 }), mk(-1000, 'start-mark', { name: 'settle', sinceTap: 1000, waitedMs: 200, interrupts: 0, ctx: 'running', activation: true }), mk(-800, 'start-mark', { name: 'wake', sinceTap: 1200, ok: true }), mk(-700, 'start-mark', { name: 'ready', sinceTap: 1300, words: 'ready' })]
  const line = (t, over = {}) => ({ t, type: 'event', kind: 'cat-voice', id: 'rh_warmup', source: 'buffer', slot: { prepared: true, buffer: true, ms: 1800, ctx: 'running' }, play: 'started', playMs: 4, activation: 'alive', ...over })

  it('started at +N мс — код отработал: «звук шёл» (ducking), шкала показывает started at +N мс', () => {
    const d = diagnoseFirstLine([...marks, line(900)])
    expect(d.cause).toBe('ducking')
    expect(d.timeline.some(t => t.what.includes('start() → started at +4 мс'))).toBe(true)
    const text = silentDiagLines(d).join('\n')
    expect(text).toContain('источник=буфер Web Audio, start() → started at +4 мс')
  })

  it('ctx-stuck → «контекст не запущен»; жест истёк не затмевает основную причину', () => {
    const d = diagnoseFirstLine([...marks, line(900, { play: 'ctx-stuck', error: 'AudioContext не запущен (interrupted)', playMs: 300, activation: 'expired' })])
    expect(d.cause).toBe('ctx-not-running')
    expect(d.title).toBe(CAUSE_TITLE['ctx-not-running'])
    expect(d.text).toContain('не стал running')
  })

  it('буфера нет (слот не подготовлен) → «нет декодированного буфера»', () => {
    const d = diagnoseFirstLine([...marks, line(900, { play: 'rejected', error: 'слот не сыграл', slot: { prepared: false, buffer: true } })])
    expect(d.cause).toBe('buffer-missing')
    expect(d.causes).toContain('slot-not-ready')
  })

  it('случай владельца (старый путь: rs=0, слот подготовлен, play() висит) — прежний вывод «PLAY() ПРИНЯТ, НО ЗВУК НЕ ЗАИГРАЛ»', () => {
    const d = diagnoseFirstLine([...marks, line(900, { source: 'slot', slot: { rs: 0, prepared: true, interrupted: false, paused: true, hasUrl: true }, play: 'pending', playMs: 700 })])
    expect(d.cause).toBe('play-not-started')
    expect(silentDiagLines(d)[1]).toContain('PLAY() ПРИНЯТ, НО ЗВУК НЕ ЗАИГРАЛ')
  })
})
