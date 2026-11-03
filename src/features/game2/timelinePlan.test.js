import { describe, it, expect } from 'vitest'
import { phraseWords, phraseText, dueFlags, estimateTimings, usableTimings, timingsOf, buildTimeline, visiblePills, LEAD_IN_MS } from './timelinePlan.js'
import { planFor } from '../rehearsal/rehearsalFixtures.js'

// План ленты: слова фразы + тайминги озвучки → пилюли с моментами. Фраза «I'm | trying | to learn», к повтору — trying и learn.
const plan = planFor('sim', { fixture: 'three' })
const words = phraseWords(plan)
const voice = [{ w: "I'm", t: 0.2, e: 0.5 }, { w: 'trying', t: 0.6, e: 1.1 }, { w: 'to', t: 1.2, e: 1.3 }, { w: 'learn', t: 1.35, e: 1.9 }]

describe('фраза плана', () => {
  it('слова по порядку, текст фразы без «|», «к повтору» — по словам плана', () => {
    expect(words).toEqual(["I'm", 'trying', 'to', 'learn'])
    expect(phraseText(plan)).toBe("I'm trying to learn")
    expect(dueFlags(words, plan)).toEqual([false, true, false, true])
    const none = planFor('sim', { fixture: 'none' })
    expect(dueFlags(phraseWords(none), none).some(Boolean)).toBe(false)
  })
})

describe('тайминги', () => {
  it('озвучка: слова сошлись — настоящие тайминги, времена приводятся к порядку', () => {
    const t = usableTimings([{ w: "I'm", t: 0.5, e: 0.2 }, { w: 'trying', t: 0.3 }, { w: ',', t: 9 }, { w: 'to', t: 1, e: 1.1 }, { w: 'learn', t: 1.2, e: 1.8 }], words)
    expect(t.map(x => x.w)).toEqual(words)
    expect(t[0].t).toBe(0.5); expect(t[0].e).toBeCloseTo(0.8, 5) // e < t → t + 0,3
    expect(t[1].t).toBeGreaterThanOrEqual(t[0].t) // t не убывает
  })
  it('слов не столько — null; оценка идёт по порядку и растягивается на длину файла', () => {
    expect(usableTimings(voice.slice(1), words)).toBeNull()
    expect(usableTimings([], words)).toBeNull()
    const est = estimateTimings(words)
    expect(est).toHaveLength(4)
    for (let i = 1; i < est.length; i++) expect(est[i].t).toBeGreaterThan(est[i - 1].e)
    expect(estimateTimings(words, 4).at(-1).e).toBeCloseTo(3.9, 1)
  })
  it('timingsOf: озвучена — не оценка; не озвучена или не сошлась — оценка (с длиной файла, если он есть)', () => {
    const ok = timingsOf(words, { url: 'u', duration: 2.1, words: voice })
    expect(ok.estimated).toBe(false); expect(ok.durationS).toBe(2.1)
    const bad = timingsOf(words, { url: 'u', duration: 3, words: voice.slice(1) })
    expect(bad.estimated).toBe(true); expect(bad.durationS).toBe(3); expect(bad.timings.at(-1).e).toBeCloseTo(2.9, 1)
    const none = timingsOf(words, null)
    expect(none.estimated).toBe(true); expect(none.durationS).toBeGreaterThan(0.5)
  })
})

describe('buildTimeline: моменты пилюль', () => {
  const tl = buildTimeline({ words, due: dueFlags(words, plan), ...timingsOf(words, { url: 'u', duration: 2.1, words: voice }) })
  it('первое слово — через подводку 1,5 с, остальные — по таймингам озвучки', () => {
    expect(tl.pills[0].startMs).toBe(LEAD_IN_MS)
    expect(tl.pills[1].startMs).toBe(LEAD_IN_MS + 400) // 0,6 − 0,2 с
    expect(tl.pills[3].startMs).toBe(LEAD_IN_MS + 1150); expect(tl.pills[3].endMs).toBe(LEAD_IN_MS + 1700)
    expect(tl.endMs).toBe(tl.pills[3].endMs)
  })
  it('голос включается так, чтобы его первое слово встало на подводку: voiceAtMs = 1500 − начало первого слова в файле', () => {
    expect(tl.voiceAtMs).toBe(1300); expect(tl.voiceMs).toBe(2100)
    expect(tl.voiceAtMs + 0.2 * 1000).toBe(tl.pills[0].startMs)
  })
  it('длинная тишина в начале файла не уводит голос в минус: подводка растёт', () => {
    const t = buildTimeline({ words, timings: voice.map(x => ({ ...x, t: x.t + 2, e: x.e + 2 })), durationS: 4 })
    expect(t.voiceAtMs).toBe(0); expect(t.pills[0].startMs).toBe(2200)
  })
  it('«Скорость» ×1,2: моменты сжаты, первое слово — тоже через подводку, длина голоса короче', () => {
    const fast = buildTimeline({ words, timings: voice, durationS: 2.1, rate: 1.2 })
    expect(fast.pills[0].startMs).toBe(LEAD_IN_MS)
    expect(fast.pills[3].startMs - fast.pills[0].startMs).toBe(Math.round(1150 / 1.2))
    expect(fast.voiceMs).toBe(1750)
  })
  it('метки: к повтору (due) и служебное слово (small: to)', () => {
    expect(tl.pills.map(p => p.due)).toEqual([false, true, false, true])
    expect(tl.pills.map(p => p.small)).toEqual([false, false, true, false])
  })
  it('«Ловлю»: на ленте только слова к повтору, их моменты те же — остальное пустые промежутки', () => {
    const due = visiblePills(tl, 'due')
    expect(due.map(p => p.text)).toEqual(['trying', 'learn'])
    expect(due.map(p => p.startMs)).toEqual([tl.pills[1].startMs, tl.pills[3].startMs])
    expect(due[1].startMs - due[0].endMs).toBeGreaterThan(200) // между ними звучало «to» и была пауза — пустое место на ленте
    expect(visiblePills(tl, 'all')).toHaveLength(4); expect(visiblePills(tl, 'none')).toEqual([])
  })
})
