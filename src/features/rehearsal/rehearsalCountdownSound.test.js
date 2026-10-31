import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { countdownPlan } from './rehearsalCountdown.js'

const h = vi.hoisted(() => ({ web: true, muted: false, silenced: false, buffers: new Map(), loaded: [], played: [] }))
vi.mock('../player/lessonVolume.js', () => ({ getLessonMuted: () => h.muted }))
vi.mock('../../shared/lib/soundQuiet.js', () => ({ isSilenced: () => h.silenced }))
vi.mock('../../shared/lib/gameAudioCtx.js', () => ({ webAudioOn: () => h.web }))
vi.mock('../../shared/lib/gameBufferPlay.js', () => ({ playGameBuffer: (buf, o) => { h.played.push({ buf, gain: o.gain }); return true } }))
vi.mock('../../shared/lib/rewardSound.js', () => ({ getRewardVolume: () => 0.7 }))
vi.mock('../player/modules/rotate-phone/wordLaneNotes.js', () => ({ makeNoteWav: (freq, ms, level) => new Uint8Array([freq, ms, level]) }))
vi.mock('../player/modules/rotate-phone/wordLaneBuffers.js', () => ({
  loadSoundBuffer: (id, bytes) => { h.loaded.push(id); bytes(); return Promise.resolve(null) },
  soundBuffer: id => h.buffers.get(id) ?? null,
  bytesOfWav: w => w.buffer,
}))
const { warmCountdown, playCountdownNote, startCountdown } = await import('./rehearsalCountdownSound.js')

beforeEach(() => { h.web = true; h.muted = false; h.silenced = false; h.buffers.clear(); h.loaded.length = 0; h.played.length = 0 })

// Звук отсчёта: игровой AudioContext, громкость через GainNode (rewardVolume), без речи системы
describe('звук отсчёта', () => {
  const plan = countdownPlan()
  it('warmCountdown декодирует три ноты заранее (по ключу на ноту); без Web Audio — ничего', () => {
    warmCountdown(); expect(h.loaded).toEqual(['rh-count:0', 'rh-count:1', 'rh-count:2'])
    h.loaded.length = 0; h.web = false; warmCountdown(); expect(h.loaded).toEqual([])
  })
  it('нота играет буфером игрового контекста с громкостью через gain; буфера нет — не играет и догружает', () => {
    expect(playCountdownNote(plan[0])).toBe(false); expect(h.loaded).toHaveLength(3); expect(h.played).toEqual([])
    h.buffers.set('rh-count:1', { tag: 'e5' })
    expect(playCountdownNote(plan[1])).toBe(true); expect(h.played).toEqual([{ buf: { tag: 'e5' }, gain: 0.7 }])
  })
  it('«без звука» в уроке и полная тишина приложения отсчёт гасят', () => {
    h.buffers.set('rh-count:0', {})
    h.muted = true; expect(playCountdownNote(plan[0])).toBe(false)
    h.muted = false; h.silenced = true; expect(playCountdownNote(plan[0])).toBe(false)
    expect(h.played).toEqual([])
  })
  it('startCountdown ставит три таймера по плану и возвращает отмену; не зависит от режима «тап вместо речи» (он про микрофон)', () => {
    const timers = [], cleared = [], played = []
    const stop = startCountdown({ play: n => played.push(n.k), setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: id => cleared.push(id) })
    expect(timers.map(t => t.ms)).toEqual([0, 500, 1000]); timers.forEach(t => t.fn()); expect(played).toEqual([0, 1, 2])
    stop(); expect(cleared).toEqual([1, 2, 3])
    const src = readFileSync(new URL('./rehearsalCountdownSound.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/tapMode|readTapMode/); expect(src).not.toMatch(/speak|Synth|utterance/i); expect(src).not.toContain('Math.random')
  })
})
