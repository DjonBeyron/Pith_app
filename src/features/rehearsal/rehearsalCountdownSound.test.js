import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { countdownPlan, countdownMs } from './rehearsalCountdown.js'

const h = vi.hoisted(() => ({ web: true, muted: false, silenced: false, ctx: null, played: [], accept: true, result: { play: 'started', ms: 3, ctx: 'running' }, logs: [] }))
vi.mock('../player/lessonVolume.js', () => ({ getLessonMuted: () => h.muted }))
vi.mock('../../shared/lib/soundQuiet.js', () => ({ isSilenced: () => h.silenced }))
vi.mock('../../shared/lib/gameAudioCtx.js', () => ({ webAudioOn: () => h.web, getGameCtx: () => h.ctx, gameCtxState: () => h.ctx?.state ?? null }))
vi.mock('../../shared/lib/gameBufferPlay.js', () => ({ playGameBuffer: (buf, o) => { h.played.push({ buf, gain: o.gain }); o.onResult?.(h.result); return h.accept } }))
vi.mock('../../shared/lib/debug.js', () => ({ pLog: t => h.logs.push(t) }))
vi.mock('../player/modules/rotate-phone/wordLaneNotes.js', () => ({ makeNoteWav: (freq, ms, level) => new Uint8Array([freq, ms, level]) }))
const { warmCountdown, playCountdownNote, startCountdown, releaseCountdown, COUNT_GAIN } = await import('./rehearsalCountdownSound.js')
const { noteBuffer } = await import('./rehearsalCountdownSynth.js')

// Мини-контекст Web Audio: createBuffer отдаёт буфер с одним каналом, resume() считаем
const fakeCtx = (state = 'running') => {
  const c = { state, sampleRate: 8000, resumed: 0, created: 0, createBuffer(ch, len, rate) { c.created += 1; const data = new Float32Array(len); return { length: len, sampleRate: rate, getChannelData: () => data, copyToChannel: d => data.set(d) } }, resume() { c.resumed += 1; return Promise.resolve() } }
  return c
}

beforeEach(() => { releaseCountdown(); h.web = true; h.muted = false; h.silenced = false; h.ctx = fakeCtx(); h.played.length = 0; h.logs.length = 0; h.accept = true; h.result = { play: 'started', ms: 3, ctx: 'running' } })

// Звук отсчёта: игровой AudioContext, СВОЯ фиксированная громкость в GainNode, журнал `[countdown]`, без речи системы
describe('звук отсчёта', () => {
  const plan = countdownPlan()
  it('warmCountdown готовит три буфера сразу (без асинхронного декодирования) и не создаёт их заново; контекст не running — будит его; без Web Audio — ничего', () => {
    warmCountdown(); expect(h.ctx.created).toBe(3); warmCountdown(); expect(h.ctx.created).toBe(3); expect(h.ctx.resumed).toBe(0)
    h.ctx = fakeCtx('interrupted'); warmCountdown(); expect(h.ctx.resumed).toBe(1)
    h.web = false; h.ctx = fakeCtx(); warmCountdown(); expect(h.ctx.created).toBe(0)
  })
  it('нота играет готовым буфером через playGameBuffer с ФИКСИРОВАННОЙ громкостью COUNT_GAIN и пишет в журнал, что сыграна', () => {
    expect(playCountdownNote(plan[1])).toBe(true)
    expect(h.played).toHaveLength(1); expect(h.played[0].gain).toBe(COUNT_GAIN); expect(h.played[0].buf).toBe(noteBuffer(h.ctx, plan[1])) // буфер из того же контекста, не пустой
    expect(h.logs).toEqual(['[countdown] нота 2/3 сыграна (контекст running, старт за 3 мс, громкость 1)'])
  })
  it('буфер создаётся сразу в момент ноты, даже если прогрева не было — первая нота не пропадает (раньше она ждала decodeAudioData)', () => {
    expect(playCountdownNote(plan[0])).toBe(true); expect(h.played).toHaveLength(1)
  })
  it('контекст не запустился (iPhone: interrupted) — в журнале причина; плеер отказал — тоже', () => {
    h.result = { play: 'ctx-stuck', ms: 300, ctx: 'interrupted' }; h.ctx = fakeCtx('interrupted')
    playCountdownNote(plan[0]); expect(h.logs[0]).toBe('[countdown] нота 1/3 НЕ сыграна: контекст не запустился (interrupted)')
    h.logs.length = 0; h.accept = false; h.result = { play: 'started', ms: 1, ctx: 'running' }; expect(playCountdownNote(plan[0])).toBe(false); expect(h.logs.at(-1)).toBe('[countdown] нота 1/3 НЕ сыграна: плеер отказал')
    h.logs.length = 0; h.ctx = null; expect(playCountdownNote(plan[0])).toBe(false); expect(h.logs[0]).toContain('НЕ сыграна: нет буфера')
  })
  it('«без звука» урока гасит отсчёт (и пишет причину); «полная тишина приложения» вкладки «Голос» — НЕТ (из неё запускается игра), громкость и выбор награды не влияют', () => {
    h.muted = true; expect(playCountdownNote(plan[0])).toBe(false); expect(h.logs[0]).toBe('[countdown] нота 1/3 НЕ сыграна: «без звука» в уроке'); expect(h.played).toEqual([])
    h.muted = false; h.silenced = true; expect(playCountdownNote(plan[0])).toBe(true); expect(h.played).toHaveLength(1)
    const src = readFileSync(new URL('./rehearsalCountdownSound.js', import.meta.url), 'utf8')
    const code = src.split('\n').filter(l => !l.startsWith('//')).join('\n') // комментарии объясняют, почему этих вызовов нет
    expect(code).not.toMatch(/isSilenced|soundQuiet|getRewardVolume|getRewardSound|rewardSound/); expect(code).not.toMatch(/tapMode|readTapMode/); expect(code).not.toMatch(/speechSynthesis|Utterance/); expect(code).not.toContain('Math.random')
  })
  it('startCountdown: три ноты по плану и сигнал конца отсчёта; отмена снимает всё; итог в журнале', () => {
    const timers = [], cleared = [], played = []
    let done = 0
    const stop = startCountdown({ play: n => { played.push(n.k); return true }, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: id => cleared.push(id), onDone: () => { done += 1 } })
    expect(timers.map(t => t.ms)).toEqual([0, 500, 1000, countdownMs()]); timers.forEach(t => t.fn())
    expect(played).toEqual([0, 1, 2]); expect(done).toBe(1); expect(h.logs).toContain('[countdown] отсчёт: сыграно 3 из 3')
    stop(); expect(cleared).toEqual([1, 2, 3, 4])
  })
  it('сыграно меньше трёх — так и записано (причина — в строках нот)', () => {
    const timers = []
    startCountdown({ play: n => n.k !== 1, setTimer: (fn, ms) => { timers.push({ fn, ms }); return 1 } }); timers.forEach(t => t.fn())
    expect(h.logs).toContain('[countdown] отсчёт: сыграно 2 из 3')
  })
  it('Web Audio выключен — запасной <audio>, громкость фиксированная, причины тоже в журнале', async () => {
    h.web = false
    const audios = []
    vi.stubGlobal('Audio', class { constructor(u) { this.u = u; audios.push(this) } play() { return Promise.resolve() } pause() {} removeAttribute() {} })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL() {} })
    expect(playCountdownNote(plan[2])).toBe(true); await Promise.resolve(); await Promise.resolve()
    expect(audios[0].volume).toBe(COUNT_GAIN); expect(h.logs.at(-1)).toBe('[countdown] нота 3/3 сыграна через <audio> (Web Audio выключен)')
    releaseCountdown(); vi.unstubAllGlobals()
  })
})
