import { describe, it, expect, vi } from 'vitest'
import { createCatVoice } from './wordLaneCatVoice.js'
import { createMouthHold } from './wordLaneMouthHold.js'
import { mouthTrack } from './wordLaneVisemes.js'
import { setCatDebug, catDebug } from './wordLaneCatDebug.js'

// Стенд без DOM: часы, rAF и таймеры — свои. Рот пишется в журнал drawn (какие формы реально «нарисованы»).
function stand() {
  let t = 0
  const frames = []
  const timers = []
  const drawn = []
  const events = []
  const look = { lineStart: vi.fn(), lineEnd: vi.fn(), talking: vi.fn() }
  const peek = { hold: vi.fn(), voice: vi.fn(), isUp: () => false }
  const setTimer = (fn, ms) => { const x = { fn, at: t + ms, done: false }; timers.push(x); return x }
  const clearTimer = x => { if (x) x.done = true }
  const hold = createMouthHold({ apply: k => drawn.push(k), now: () => t, setTimer, clearTimer })
  const voice = createCatVoice({
    hold, look, peek, drawn: () => drawn.length, now: () => t,
    raf: f => frames.push(f), caf: () => { frames.length = 0 },
    setTimer, clearTimer, log: (kind, d) => events.push({ kind, ...d }),
  })
  // Прокрутить время до ms с шагом кадра; в каждом кадре — микрофонная просьба mic(t), если задана
  const run = (until, { mic = null, fps = 16 } = {}) => {
    while (t < until) {
      t += fps
      mic?.(t)
      const f = frames.splice(0)
      f.forEach(fn => fn())
      timers.filter(x => x.at <= t && !x.done).forEach(x => { x.done = true; x.fn() })
    }
  }
  return { voice, look, peek, drawn, events, run, frames, now: () => t, advance: ms => { t += ms } }
}

describe('кот говорит реплику: микрофон не перебивает рот', () => {
  it('пока идёт реплика, mouth(level) ничего не рисует и не трогает усы и выскакивание; попытки считаются', () => {
    const s = stand()
    const track = mouthTrack('Повторяй за мной', 1500)
    s.voice.speak(track, 1500, { id: 'round_build' })
    expect(s.voice.busy()).toBe(true)
    const before = s.drawn.length
    s.voice.mouth(0, null)          // шум микрофона: «тишина» — раньше рисовала closed поверх реплики
    s.voice.mouth(0.9, 'E')
    expect(s.drawn.length).toBe(before)
    expect(s.peek.voice).not.toHaveBeenCalled()
    s.run(1700, { mic: () => s.voice.mouth(0.02, null) })   // эхо динамика на каждом кадре
    const end = s.events.find(e => e.kind === 'cat-speak-end')
    expect(end.micBlocked).toBeGreaterThan(90)
    expect(end.shapes).toBeGreaterThan(5)                    // рот реально менялся — дорожка прошла целиком
    expect(end.why).toBe('done')
  })

  it('рот реплики — только формы дорожки (никаких closed/half/open от микрофона), до самого конца', () => {
    const s = stand()
    s.voice.speak(mouthTrack('learn', 1000), 1000, { id: 'x' })
    s.run(1000, { mic: () => s.voice.mouth(0.5, null) })
    const lineForms = s.drawn.filter(k => k !== 'closed')
    expect(lineForms.every(k => /^[A-Z]$/.test(k))).toBe(true)
    expect(lineForms).toContain('E')                         // «learn» — округлый рот
  })

  it('после конца реплики микрофон снова ведёт рот', () => {
    const s = stand()
    s.voice.speak(mouthTrack('hi', 400), 400, { id: 'x' })
    s.run(600)
    expect(s.voice.busy()).toBe(false)
    s.advance(200)
    s.voice.mouth(0.9, null)
    expect(s.drawn.at(-1)).toBe('open')
    expect(s.peek.voice).toHaveBeenCalledWith(0.9)
    expect(s.look.talking).toHaveBeenLastCalledWith(true)
  })

  it('усы (talking) подтверждаются каждый кадр и снимаются только в конце — даже если снаружи попросили снять', () => {
    const s = stand()
    s.voice.speak(mouthTrack('Отлично', 1000), 1000, { id: 'well_done' })
    s.look.talking.mockClear()
    s.run(500)
    const trues = s.look.talking.mock.calls.filter(c => c[0] === true).length
    expect(trues).toBeGreaterThan(20)
    expect(s.look.talking.mock.calls.some(c => c[0] === false)).toBe(false)
    s.run(1100)
    expect(s.look.talking).toHaveBeenLastCalledWith(false)
    expect(s.look.lineEnd).toHaveBeenCalledTimes(1)
  })
})

describe('кот говорит реплику: дорожка и конец', () => {
  it('нет дорожки (пустой текст) — рот «жуёт» запасным циклом, а не стоит; в журнале empty: true', () => {
    const s = stand()
    s.voice.speak([], 1200, { id: 'blank' })
    s.run(1300)
    expect(new Set(s.drawn.filter(k => /^[A-Z]$/.test(k))).size).toBeGreaterThan(2)
    const start = s.events.find(e => e.kind === 'cat-speak')
    expect(start).toMatchObject({ id: 'blank', ms: 1200, trackLen: 0, empty: true })
  })

  it('журнал: cat-speak {id, ms, trackLen, up} в начале и cat-speak-end {played, shapes, micBlocked} в конце', () => {
    const s = stand()
    const track = mouthTrack('Теперь твоя очередь', 1800)
    s.voice.speak(track, 1800, { id: 'your_turn' })
    s.run(1900)
    const [a, b] = s.events
    expect(a).toEqual({ kind: 'cat-speak', id: 'your_turn', ms: 1800, trackLen: track.length, empty: false, up: false })
    expect(b.kind).toBe('cat-speak-end')
    expect(b.played).toBeGreaterThanOrEqual(1800)
    expect(b.shapes).toBeGreaterThan(5)
    expect(b.micBlocked).toBe(0)
  })

  it('кадры не идут (вкладка в фоне, перегруз) — реплику закрывает таймер, микрофон снова ведёт рот', () => {
    const s = stand()
    s.voice.speak(mouthTrack('Отлично', 1000), 1000, { id: 'well_done' })
    s.frames.length = 0                    // rAF «остановился»
    s.advance(1200)
    s.run(1300)
    expect(s.voice.busy()).toBe(false)
    expect(s.events.at(-1)).toMatchObject({ kind: 'cat-speak-end', why: 'timer' })
  })

  it('stop() (размонтирование/пересборка кота) закрывает реплику: микрофон не залипает навсегда', () => {
    const s = stand()
    s.voice.speak(mouthTrack('Привет', 1000), 1000)
    s.voice.stop()
    expect(s.voice.busy()).toBe(false)
    expect(s.events.at(-1)).toMatchObject({ kind: 'cat-speak-end', why: 'stopped' })
    s.voice.mouth(0.9, null)
    expect(s.peek.voice).toHaveBeenCalled()
  })

  it('новая реплика поверх старой закрывает старую (replaced) и ведёт рот по своей дорожке', () => {
    const s = stand()
    s.voice.speak(mouthTrack('one', 800), 800, { id: 'a' })
    s.run(200)
    s.voice.speak(mouthTrack('two', 800), 800, { id: 'b' })
    s.run(1100)
    const ends = s.events.filter(e => e.kind === 'cat-speak-end')
    expect(ends.map(e => [e.id, e.why])).toEqual([['a', 'replaced'], ['b', 'done']])
  })

  it('нулевая длительность — реплика не стартует и микрофон не блокируется', () => {
    const s = stand()
    s.voice.speak(mouthTrack('hi', 0), 0, { id: 'x' })
    expect(s.voice.busy()).toBe(false)
    expect(s.events).toEqual([])
  })
})

describe('журнал реплик кота в отладку', () => {
  it('catDebug отдаёт событие приёмнику (журнал игры); без приёмника и при его ошибке — молча', () => {
    const got = []
    setCatDebug((kind, d) => got.push([kind, d]))
    catDebug('cat-speak', { id: 'a' })
    expect(got).toEqual([['cat-speak', { id: 'a' }]])
    setCatDebug(() => { throw new Error('boom') })
    expect(() => catDebug('cat-speak', {})).not.toThrow()
    setCatDebug(null)
    expect(() => catDebug('cat-speak', {})).not.toThrow()
    expect(got).toHaveLength(1)
  })
})
