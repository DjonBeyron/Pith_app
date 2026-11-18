import { describe, it, expect } from 'vitest'
import { createStudentGame, stepStudent, SPEAK_GRACE_MS } from './wordLaneStudent.js'
import { buildRecipe } from './wordLaneRecipe.js'

// Остаток принятой реплики — не промах (владелец, v3.3.270: Мия говорила «мимо» на верный ответ): слушатель выдал «[unk] помнить» — «[unk]» счёт промахов увеличил, «помнить» принято в том же кадре.
const DT = 16
const step = buildRecipe(["I'm", 'trying', 'to learn']).rounds[0].steps[0]

/** Прогон: в кадре at слушатель отдаёт слово 0 и (miss) ещё один промах; → события кадра at */
function frame(at, { hit = true, miss = false } = {}) {
  const g = createStudentGame({ step, chunks: ["I'm", 'trying', 'to learn'] })
  const seq = []; let misses = 0, out = []
  for (let t = 0; t <= at; t += DT) {
    if (t === at) { if (hit) seq.push(0); if (miss) misses += 1 }
    const ev = stepStudent(g, t, { level: 0, seq, misses })
    if (t === at) out = ev
  }
  return out
}
const types = ev => ev.map(e => e.type)

describe('принятое слово и шум в одной реплике', () => {
  it('слово принято и в том же кадре счёт промахов вырос — это один ответ: claim есть, miss нет', () => {
    const t = types(frame(3008, { hit: true, miss: true }))
    expect(t).toContain('claim'); expect(t).not.toContain('miss')
  })
  it('промах без принятого слова остаётся промахом (пилюля едет, слушатель услышал не то)', () => {
    const t = types(frame(3008, { hit: false, miss: true }))
    expect(t).toContain('miss'); expect(t).not.toContain('claim')
  })
  it('счёт промахов шумом не «копится» на следующий кадр: после принятого слова miss не приходит и позже', () => {
    const g = createStudentGame({ step, chunks: ["I'm", 'trying', 'to learn'] })
    const seq = []; let misses = 0; const all = []
    for (let t = 0; t <= 4000; t += DT) {
      if (t === 3008) { seq.push(0); misses += 1 }
      all.push(...stepStudent(g, t, { level: 0, seq, misses }).map(e => e.type))
    }
    expect(all).toContain('claim'); expect(all).not.toContain('miss')
  })
})

// v3.3.277 (журнал владельца, Мия ×1,96): верный черновик «пытаюсь» есть, пилюля у нижней границы, итог ещё не пришёл — засчитать по черновику, а не «не успел»
describe('верный черновик у нижней границы', () => {
  const run = (tail, fresh = true) => {
    const g = createStudentGame({ step, chunks: ["I'm", 'trying', 'to learn'] })
    const evs = []
    for (let t = 0; t <= 14000; t += DT) { const e = stepStudent(g, t, { level: 0, seq: [], misses: 0, tail, heardT: fresh ? t - 100 : -Infinity }); evs.push(...e); if (e.some(x => x.type === 'fail' || x.type === 'claim')) break }
    return evs
  }
  it('без черновика — «не успел» (как раньше)', () => { const t = types(run(null)); expect(t).toContain('fail'); expect(t).not.toContain('claim') })
  it('с черновиком на слове пилюли — claim по черновику, fail нет', () => {
    const g0 = createStudentGame({ step, chunks: ["I'm", 'trying', 'to learn'] })
    stepStudent(g0, 3000, { level: 0, seq: [], misses: 0 })
    const target = g0.reps.find(r => r.state === 'fly')?.target
    const t = run({ target, tokens: [] }); expect(types(t)).toContain('claim'); expect(types(t)).not.toContain('fail'); expect(t.find(x => x.type === 'claim').draft).toBe(true)
  })
  it('давний хвост (речи давно нет) не засчитывает', () => { expect(types(run({ target: 0, tokens: [] }, false))).toContain('fail') })
  it('черновик на ДРУГОЕ слово пилюлю не засчитывает', () => { expect(types(run({ target: 99, tokens: [] }))).toContain('fail') })
})

// v3.3.278 (журнал владельца, Мия ×1,6: «слово не прошло», хотя я уже говорил): пилюля прошла границу, голос звучит — «не успел» откладывается, итог в окне ещё засчитывается
describe('голос звучит у нижней границы', () => {
  const find = () => { // момент, когда пилюля первого повтора проходит границу без речи
    const g = createStudentGame({ step, chunks: ["I'm", 'trying', 'to learn'] })
    for (let t = 0; t <= 14000; t += DT) if (stepStudent(g, t, { level: 0, seq: [], misses: 0 }).some(x => x.type === 'fail')) return t
    return null
  }
  const run = (levelOn, claimAfterMs) => {
    const tFail = find(); const g = createStudentGame({ step, chunks: ["I'm", 'trying', 'to learn'] }); const evs = []; let target
    for (let t = 0; t <= tFail + 900; t += DT) {
      target ??= g.reps.find(r => r.state === 'fly')?.target
      const seq = claimAfterMs != null && t >= tFail + claimAfterMs ? [target] : []
      const level = levelOn && t >= tFail - 300 && t < tFail + claimAfterMs + 1 ? 0.5 : 0
      evs.push(...stepStudent(g, t, { level, seq, misses: 0, confirmed: true }).map(e => ({ t, type: e.type })))
    }
    return { evs, tFail }
  }
  it('без голоса — «не успел» сразу, как раньше', () => { const r = run(false, null); expect(r.evs.find(e => e.type === 'fail')?.t).toBeLessThanOrEqual(r.tFail + DT) })
  it('голос звучит, итог пришёл через 200 мс после границы — слово принято, «не успел» нет', () => { const r = run(true, 200); expect(r.evs.some(e => e.type === 'claim')).toBe(true); expect(r.evs.some(e => e.type === 'fail')).toBe(false) })
  it('голос звучит, но итога нет — «не успел» не позже SPEAK_GRACE_MS', () => { const r = run(true, null); const f = r.evs.find(e => e.type === 'fail'); expect(f).toBeTruthy(); expect(f.t - r.tFail).toBeLessThanOrEqual(SPEAK_GRACE_MS + 2 * DT) })
})
