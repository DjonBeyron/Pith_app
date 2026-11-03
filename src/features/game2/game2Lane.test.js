import { describe, it, expect } from 'vitest'
import { runLane, TAIL_MS, HINT_HOLD_MS } from './game2Lane.js'
import { MODES } from './game2Modes.js'
import { buildTimeline, phraseWords, dueFlags, timingsOf } from './timelinePlan.js'
import { planFor } from '../rehearsal/rehearsalFixtures.js'
import { HEARD_LAG_MS } from './game2Hits.js'

// Проход ленты на поддельных часах: now() ведёт тест, кадры — очередь (raf). Слушатель — заглушка, которая отдаёт «услышанные» слова в нужный момент.
const plan = planFor('sim', { fixture: 'three' })
const words = phraseWords(plan)
const voiceWords = [{ w: "I'm", t: 0.2, e: 0.5 }, { w: 'trying', t: 0.6, e: 1.1 }, { w: 'to', t: 1.2, e: 1.3 }, { w: 'learn', t: 1.35, e: 1.9 }]
const timeline = rate => buildTimeline({ words, due: dueFlags(words, plan), ...timingsOf(words, { url: 'u', duration: 2.1, words: voiceWords }), rate })

function rig(mode, { rate = 1, cancelAt = null } = {}) {
  let t = 1000 // абсолютное время теста (ненулевое: t0 берётся из now())
  const queue = []
  const marks = [], calls = [], ts = [], wins = []
  const handlers = {}
  const voice = { start: o => { calls.push(['voice', Math.round(t - base), o.rate, o.gain]); o.onStart?.(); return true }, stop: () => calls.push(['voice-stop']) }
  const base = t
  const lane = { win: (i, on) => wins.push([Math.round(t - base), i, on]), setT: v => ts.push(v), mark: (i, st, o) => marks.push([Math.round(t - base), i, st, o?.rise ?? null]) }
  const hints = []
  const tl = timeline(rate)
  const done = runLane({
    mode, timeline: tl, lane, voice, now: () => t, raf: f => queue.push(f), cancelled: () => cancelAt != null && t - base >= cancelAt,
    makeListener: onHeard => { handlers.onHeard = onHeard; return { start: () => calls.push(['listen-start']), dispose: () => calls.push(['listen-stop']) } },
    onHint: p => hints.push(p.i),
  })
  const run = (until = 12000, step = 20) => { while (t - base < until && queue.length) { for (const f of queue.splice(0)) f(); t += step } }
  // «Слово услышано» в момент абсолютного времени at (+ запаздывание Vosk): как будто пришло из слушателя
  const hear = (text, atMs) => { run(atMs); handlers.onHeard?.({ text, at: base + atMs + HEARD_LAG_MS, tap: false }) }
  return { done, run, hear, marks, calls, ts, hints, wins, tl, now: () => t - base }
}

describe('«Слушаю»: пилюля горит в момент своего слова', () => {
  it('lit ровно на startMs, done — на endMs; голос включается на voiceAtMs и без слушателя', async () => {
    const r = rig(MODES.listen)
    r.run()
    const res = await r.done
    const at = (i, st) => r.marks.find(m => m[1] === i && m[2] === st)[0]
    for (const p of r.tl.pills) { expect(at(p.i, 'lit')).toBeGreaterThanOrEqual(p.startMs); expect(at(p.i, 'lit')).toBeLessThan(p.startMs + 40); expect(at(p.i, 'done')).toBeGreaterThanOrEqual(p.endMs) }
    expect(r.calls.find(c => c[0] === 'voice')[1]).toBeGreaterThanOrEqual(r.tl.voiceAtMs)
    expect(r.calls.some(c => c[0] === 'listen-start')).toBe(false) // пользователь только смотрит и слушает
    expect(res.total).toBe(4)
    expect(r.calls.at(-1)).toEqual(['voice-stop'])
  })
  it('голос стартует с rate и gain режима: тень — −6 дБ, скорость — ×1,2', async () => {
    const a = rig(MODES.shadow); a.run(); await a.done
    expect(a.calls.find(c => c[0] === 'voice').slice(2)).toEqual([1, MODES.shadow.gain])
    const b = rig(MODES.speed, { rate: 1.2 }); b.run(); await b.done
    expect(b.calls.find(c => c[0] === 'voice').slice(2)).toEqual([1.2, MODES.speed.gain])
  })
})

describe('«Ловлю»: окно слова видно глазами', () => {
  it('пилюля светится (win on) с начала окна до конца слова + 0,8 с; пойманная гаснет сразу, остальные — когда окно прошло', async () => {
    const r = rig(MODES.catch)
    const [trying, learn] = r.tl.pills.filter(p => p.due)
    r.hear('trying', trying.startMs + 100)
    r.run()
    await r.done
    const on = i => r.wins.find(w => w[1] === i && w[2] === true)[0]
    const off = i => r.wins.find(w => w[1] === i && w[2] === false)[0]
    expect(on(trying.i)).toBeGreaterThanOrEqual(trying.startMs - 800); expect(on(trying.i)).toBeLessThan(trying.startMs - 800 + 60)
    expect(off(trying.i)).toBeLessThan(trying.startMs + 400) // поймана — окно закрыто сразу
    expect(off(learn.i)).toBeGreaterThanOrEqual(learn.endMs + 800) // не поймана — светится до конца окна
    expect(r.wins.every(w => [trying.i, learn.i].includes(w[1]))).toBe(true) // свет только у слов к повтору
  })
})

describe('«Ловлю»: слово в окне ±0,8 с', () => {
  it('на ленте только слова к повтору; попал — пилюля заливается и улетает (rise), слово не в своё время и чужое — нет', async () => {
    const r = rig(MODES.catch)
    const [trying, learn] = r.tl.pills.filter(p => p.due)
    r.hear('trying', trying.startMs + 100)
    r.hear('banana', learn.startMs)                    // чужое слово
    r.hear('learn', learn.startMs + 1000)              // learn, но окно ещё не вышло (end + 0,8)? конец слова + 800 → попадает; проверим ниже промахом по раннему
    r.run()
    const res = await r.done
    expect(res.total).toBe(2)
    const hits = r.marks.filter(m => m[2] === 'hit')
    expect(hits.map(m => m[1])).toEqual([1, 3])
    expect(hits.every(m => m[3] === true)).toBe(true) // улетают вверх
    expect(res.missed).toEqual([])
    expect(r.calls.some(c => c[0] === 'listen-start')).toBe(true)
  })
  it('молчание — обе пилюли «miss» (полоски, уезжают вниз), режим вернёт missed для повтора', async () => {
    const r = rig(MODES.catch)
    r.run()
    const res = await r.done
    expect(r.marks.filter(m => m[2] === 'miss').map(m => m[1])).toEqual([1, 3])
    expect(res.credited).toBe(0); expect(res.missed).toEqual([1, 3])
    const lastEnd = Math.max(...r.tl.pills.filter(p => p.due).map(p => p.endMs))
    expect(r.now()).toBeGreaterThanOrEqual(lastEnd + MODES.catch.window)
  })
  it('слишком рано (раньше окна −0,8 с до слова) не засчитывается', async () => {
    const r = rig(MODES.catch)
    const trying = r.tl.pills[1]
    r.hear('trying', trying.startMs - 1500)
    r.run()
    const res = await r.done
    expect(res.missed).toContain(1)
  })
})

describe('«Тень» и «По памяти»: заливка по распознанным словам', () => {
  it('слова своего окна заливаются по порядку фразы (без подъёма); лишнее слово не засчитывается', async () => {
    const r = rig(MODES.shadow)
    for (const p of r.tl.pills) r.hear(p.text, p.startMs + 50)
    r.hear('learn', r.tl.pills[3].endMs + 100) // повторное слово: пилюля уже залита
    r.run()
    const res = await r.done
    expect(res.credited).toBe(4)
    expect(r.marks.filter(m => m[2] === 'hit').map(m => m[1])).toEqual([0, 1, 2, 3])
    expect(r.marks.filter(m => m[2] === 'hit').every(m => m[3] === false)).toBe(true)
  })
  it('«По памяти»: голоса Пита нет; застрял на 3 с — одна подсказка про первое слово', async () => {
    const r = rig(MODES.recall)
    r.run()
    const res = await r.done
    expect(r.calls.some(c => c[0] === 'voice')).toBe(false)
    expect(res.hinted).toBe(true); expect(r.hints).toEqual([0])
    expect(r.now()).toBeGreaterThanOrEqual(r.tl.pills[0].startMs + 3000 + HINT_HOLD_MS) // подпись успевают прочитать: проход держится после подсказки
  })
  it('«По памяти»: если человек говорит, подсказки нет', async () => {
    const r = rig(MODES.recall)
    r.hear("I'm", r.tl.pills[0].startMs + 50)
    r.run()
    expect((await r.done).hinted).toBe(false)
  })
})

describe('отмена и конец', () => {
  it('отмена останавливает голос и слушатель сразу', async () => {
    const r = rig(MODES.shadow, { cancelAt: 800 })
    r.run()
    await r.done
    expect(r.now()).toBeLessThan(1000)
    expect(r.calls.filter(c => c[0] === 'voice-stop' || c[0] === 'listen-stop')).toHaveLength(2)
  })
  it('конец прохода — после слов, голоса, окна и хвоста; кадры двигают ленту (setT)', async () => {
    const r = rig(MODES.listen)
    r.run()
    await r.done
    expect(r.now()).toBeGreaterThanOrEqual(r.tl.endMs + TAIL_MS)
    expect(r.ts.length).toBeGreaterThan(50); expect(r.ts[0]).toBeLessThan(50)
  })
})
