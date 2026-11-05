import { describe, it, expect, vi } from 'vitest'

const state = { muted: false, web: true }
vi.mock('../player/lessonVolume.js', () => ({ getLessonMuted: () => state.muted }))
vi.mock('../../shared/lib/gameAudioCtx.js', () => ({ webAudioOn: () => state.web, getGameCtx: () => fakeCtx }))
vi.mock('../../shared/lib/gameBufferPlay.js', () => ({ playGameBuffer: vi.fn(() => true) }))

const made = []
const fakeCtx = { sampleRate: 44100, createBuffer: (ch, len, rate) => { const data = new Float32Array(len); const b = { len, rate, data, copyToChannel: d => data.set(d), getChannelData: () => data }; made.push(b); return b } }
const { synthTakeoff, takeoffBuffer, takeoffOn, playTakeoff, takeoffHz, dropTakeoffBuffer, TAKEOFF_MS, TAKEOFF_RMS, TAKEOFF_FROM_HZ, TAKEOFF_TO_HZ } = await import('./raceTakeoffSound.js')
const { COUNT_RMS, COUNT_PEAK } = await import('../rehearsal/rehearsalCountdownSynth.js')

const rmsOf = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length)
const crossings = (a, from, to) => { let c = 0; for (let i = from + 1; i < to; i++) if (a[i - 1] <= 0 && a[i] > 0) c++; return c }

describe('звук взлёта пилюли гонки: синтез', () => {
  it('длина 180 мс, тон ползёт вверх ми → ля, огибающая мягкая: тихий вход, затухание к нулю', () => {
    const a = synthTakeoff(44100)
    expect(TAKEOFF_MS).toBe(180); expect(a.length).toBe(Math.floor(44100 * 0.18))
    expect(takeoffHz(0)).toBeCloseTo(TAKEOFF_FROM_HZ, 6); expect(takeoffHz(1)).toBeCloseTo(TAKEOFF_TO_HZ, 6)
    const third = Math.floor(a.length / 3)
    expect(crossings(a, 0, third)).toBeLessThan(crossings(a, a.length - third, a.length)) // период короче в конце: частота выросла
    const early = [...a.slice(0, 20)].map(Math.abs); expect(Math.max(...early)).toBeLessThan(0.02) // мягкая атака: первые 0,5 мс почти тихие
    expect(Math.abs(a[a.length - 1])).toBeLessThan(0.002)
  })
  it('громкость −10 дБ от нот отсчёта, пик не выше COUNT_PEAK', () => {
    const a = synthTakeoff(48000)
    expect(rmsOf([...a])).toBeCloseTo(TAKEOFF_RMS, 3); expect(TAKEOFF_RMS / COUNT_RMS).toBeCloseTo(10 ** (-10 / 20), 5)
    expect(Math.max(...[...a].map(Math.abs))).toBeLessThanOrEqual(COUNT_PEAK)
  })
  it('буфер синтезируется один раз на частоту и переиспользуется; drop сбрасывает', () => {
    dropTakeoffBuffer(); made.length = 0
    const b1 = takeoffBuffer(fakeCtx), b2 = takeoffBuffer(fakeCtx)
    expect(b1).toBe(b2); expect(made).toHaveLength(1); expect(b1.len).toBe(synthTakeoff(44100).length)
    dropTakeoffBuffer(); takeoffBuffer(fakeCtx); expect(made).toHaveLength(2)
    expect(takeoffBuffer({ sampleRate: 48000, createBuffer: () => { throw new Error('x') } })).toBeNull()
  })
})

describe('звук взлёта: когда играет', () => {
  const stage = { race: true, type: 'student', act: 'sprint' }
  it('win ступени-очереди «Разгона» и «Слушай и лови», на последнем куске; промах, вершина, спуск и репетиция — нет', () => {
    expect(takeoffOn(stage, 'win', { last: true, count: 1 })).toBe(true)
    expect(takeoffOn({ ...stage, act: 'catch' }, 'win', undefined)).toBe(true)
    expect(takeoffOn(stage, 'win', { last: false })).toBe(false)
    expect(takeoffOn(stage, 'miss', {})).toBe(false); expect(takeoffOn(stage, 'fail', {})).toBe(false)
    expect(takeoffOn({ ...stage, act: 'climb' }, 'win', {})).toBe(false); expect(takeoffOn({ ...stage, act: 'descent' }, 'win', {})).toBe(false)
    expect(takeoffOn({ type: 'student', act: 'build' }, 'win', {})).toBe(false) // у репетиции нет race: true
    expect(takeoffOn(null, 'win', {})).toBe(false)
  })
  it('играет буфер через игровой плеер с фиксированной громкостью; «без звука» урока и нет Web Audio — тишина', () => {
    const play = vi.fn(() => true)
    expect(playTakeoff({ play })).toBe(true); expect(play).toHaveBeenCalledTimes(1)
    expect(play.mock.calls[0][0].len).toBe(synthTakeoff(44100).length); expect(play.mock.calls[0][1]).toEqual({ gain: 1 })
    state.muted = true; expect(playTakeoff({ play })).toBe(false); state.muted = false
    state.web = false; expect(playTakeoff({ play })).toBe(false); state.web = true
    expect(play).toHaveBeenCalledTimes(1)
  })
  it('подключён в директоре гонки (rec → win) и не в директоре репетиции', async () => {
    const { readFileSync } = await import('node:fs')
    const race = readFileSync(new URL('./useRaceActs.js', import.meta.url), 'utf8'), rh = readFileSync(new URL('../rehearsal/useRehearsalActs.js', import.meta.url), 'utf8')
    expect(race).toContain('if (takeoffOn(running, kind, info)) playTakeoff()'); expect(rh).not.toContain('Takeoff')
  })
})
