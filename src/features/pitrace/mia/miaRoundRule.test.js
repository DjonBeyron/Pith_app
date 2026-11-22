import { describe, it, expect } from 'vitest'
import { reduceMia, miaInit } from './raceMia.js'
import { buildStages } from '../../player/modules/rotate-phone/wordLaneStages.js'
import { createStudentGame, stepStudent, MAX_HOLD_MS } from '../../player/modules/rotate-phone/wordLaneStudent.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'

// Решение владельца 2026-11-22: «допрос сделай как в экзамене». Журнал iPhone v3.3.339, круг «Допрос у Мии»: пилюля «I'm» выехала в +97,592 с, а в +97,983 с Мия начала «Слово ушло, я ждать не люблю»
// (2,0 с) — про ПРОШЛУЮ пилюлю; «I'm» прожила 2,4 с, из них 2,0 с говорила Мия (микрофон на время её голоса выключен) → «не успел» → новая колкость поверх следующей пилюли.
// Правило: Мия колет, только когда на пилюлю ответить уже нельзя (fail), а следующая пилюля выезжает строго после её реплики (круг без очереди внахлёст, как в экзамене).
const W = [['meet', 'встретить'], ['trying', 'пытаюсь'], ['remember', 'помнить']].map(([text, translation]) => ({ text, translation }))
const round = (o = {}) => ({ mia: 'round', act: 'catch', sid: 'catch3', words: W, ...o })
const start = st => reduceMia({ ...miaInit(), phase: 'in', act: st.act }, { t: 'enter', stage: st }).mia
const ids = r => r.say.map(c => c.id)
const stages = (() => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race' }); return buildStages({ chunks: p.chunks, plan: p, rate: 1 }).stages })()

describe('«Допрос у Мии»: колкость — только когда пилюля недоступна', () => {
  it('сказал неверно (miss), пилюля ещё едет — Мия молчит; серия верных сброшена', () => {
    const st = round(), m = { ...start(st), streak: 1 }, r = reduceMia(m, { t: 'miss', stage: st, idx: 0 })
    expect(r.say).toEqual([]); expect(r.mia.streak).toBe(0)
  })
  it('пилюля ушла (fail) — одна колкость; ошибка и потом «не успел» на том же слове — тоже одна, в момент ухода', () => {
    const st = round(), a = reduceMia(start(st), { t: 'miss', stage: st, idx: 0 }), b = reduceMia(a.mia, { t: 'fail', stage: st, idx: 0 })
    expect(ids(a)).toEqual([]); expect(ids(b)).toEqual(['mia_miss_1'])
    expect(ids(reduceMia(b.mia, { t: 'fail', stage: st, idx: 1 }))).toEqual(['mia_miss_2'])
  })
  it('ловушка: промолчал — верно (как верный ответ); «поверил» и сказал — колкость, когда пилюля ушла, слово верным не считается', () => {
    const st = round({ words: [{ ...W[0], trap: true }, W[1]] }), m = start(st)
    const ok = reduceMia(m, { t: 'fail', stage: st, idx: 0 }); expect(ids(ok)).toEqual(['mia_ok_1']); expect(ok.mia.rwon[0]).toBe(true)
    const a = reduceMia(m, { t: 'miss', stage: st, idx: 0 }), b = reduceMia(a.mia, { t: 'fail', stage: st, idx: 0 })
    expect(ids(a)).toEqual([]); expect(ids(b)).toEqual(['mia_miss_1']); expect(b.mia.rwon?.[0]).toBeFalsy()
  })
  it('Пит в «Допросе» верное слово не называет и «Следующее слово» не говорит (это только экзамен)', () => {
    const st = round(), r = reduceMia(start(st), { t: 'fail', stage: st, idx: 0 })
    expect(r.say.every(c => c.who === 'mia')).toBe(true)
  })
})

describe('«Допрос у Мии»: следующая пилюля — строго после речи Мии', () => {
  it('круг Мии без очереди внахлёст (как экзамен), и после вписывания слов тоже; обычные круги проходов — очередь, как были', () => {
    for (const act of ['sprint', 'catch']) {
      const st = stages.find(s => s.sid === `${act}3`)
      expect(st.step.overlap).toBe(false); expect(st.step.holdAll).toBe(true); expect(st.step.preSay).toBe(true)
      st.fill(st.words.slice(0, 2)); expect(stages.find(s => s.sid === `${act}3`).step.overlap).toBe(false)
      expect(stages.find(s => s.sid === act).step.overlap).toBe(true)
    }
    expect(stages.find(s => s.sid === 'boss').step.overlap).toBe(false)
  })
  it('движок: слово следующей пилюли (pre) и её выезд — после «не успел» прежней и после реплики Мии (2 с), без мёртвого ожидания и без страховки MAX_HOLD_MS', () => {
    const step = stages.find(s => s.sid === 'catch3').step
    const g = createStudentGame({ step, chunks: step.chunks, estMs: c => step.chunkMs[c], maxTries: step.maxTries })
    const MIA_MS = 2000, WORD_MS = 800, seen = []
    let busyTo = 0
    for (let t = 0; t < 60000 && !g.finished; t += 16) {
      for (const e of stepStudent(g, t, { hold: busyTo > t, pitMs: Math.max(0, busyTo - t) })) {
        if (!['pre', 'spawn', 'fail'].includes(e.type)) continue
        seen.push({ type: e.type, idx: e.rep.idx, t })
        if (e.type === 'fail') busyTo = t + MIA_MS   // Мия колет (очередь речи держит Пита «занятым»: useRaceActs.pitLeft → mspeech.leftMs)
        if (e.type === 'pre') busyTo = t + WORD_MS   // диктор говорит слово пилюли
      }
    }
    const at = (type, idx) => seen.find(e => e.type === type && e.idx === idx)?.t
    for (let i = 1; i < step.reps.length; i++) {
      const gone = at('fail', i - 1), word = at('pre', i), out = at('spawn', i)
      expect(word).toBeGreaterThanOrEqual(gone + MIA_MS)      // слово — после колкости, а не до ухода прежней пилюли
      expect(out).toBeGreaterThanOrEqual(word)                 // пилюля — не раньше своего слова
      expect(word - (gone + MIA_MS)).toBeLessThanOrEqual(50)   // и сразу после неё: ожидания сверх речи нет
      expect(word - gone).toBeLessThan(MAX_HOLD_MS)
    }
    expect(seen.filter(e => e.type === 'pre')).toHaveLength(step.reps.length) // ни одна пилюля не выехала «немой»
  })
})
