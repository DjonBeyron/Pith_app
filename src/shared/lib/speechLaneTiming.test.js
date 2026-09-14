import { describe, it, expect } from 'vitest'
import {
  shotProgress, hitTime, frameLayout, activeWord, findPhraseOccurrences, litWindows,
  freeLane, laneCollisions, autoLayoutCoach, FLIGHT_S, shotKey,
} from './speechLaneTiming.js'
import * as timing from './speechLaneTiming.js'

const layer = (id, over = {}) => ({ id, text: id, translation: `${id}-ru`, role: 'coach', lane: 0, clips: [{ start: 0, end: 2 }], repeats: [], ...over })
// «I. I. Try. Try.» — как отдаёт ElevenLabs: слово с точкой, начало в секундах
const wt = [{ w: 'I.', t: 0.2 }, { w: 'I.', t: 0.8 }, { w: 'Try.', t: 1.6 }, { w: 'Try.', t: 2.4 }]
const wholeFile = [{ id: 'a', at: 0, from: 0, len: 10 }]

describe('полёт слова', () => {
  it('прогресс 0 у верха, 1 — ушло; вне клипа null; круг — на середине', () => {
    const s = { start: 2, end: 4 }
    expect(shotProgress(s, 2)).toBe(0)
    expect(shotProgress(s, 3)).toBe(0.5)
    expect(shotProgress(s, 4)).toBeNull()
    expect(shotProgress(s, 1)).toBeNull()
    expect(hitTime(s)).toBe(3)
  })

  it('frameLayout отдаёт только летящие вылеты, повторы — своим ключом', () => {
    const l = layer('try', { repeats: [{ start: 5, end: 7 }] })
    expect(frameLayout([l], 1).map(w => w.key)).toEqual([shotKey('try', 0)])
    expect(frameLayout([l], 6).map(w => w.key)).toEqual([shotKey('try', 1)])
    expect(frameLayout([l], 3)).toEqual([])
    expect(frameLayout([{ ...l, visible: false }], 1)).toEqual([])
  })

  it('активное слово — ближайшее к кругу, с ролью и переводом', () => {
    const a = layer('a', { clips: [{ start: 0, end: 4 }] })            // в t=1 прогресс 0.25
    const b = layer('b', { role: 'user', clips: [{ start: 0, end: 2 }] }) // в t=1 прогресс 0.5
    expect(activeWord([a, b], 1)).toMatchObject({ text: 'b', role: 'user', translation: 'b-ru' })
    expect(activeWord([a, b], 9)).toBeNull()
  })
})

describe('окна озвучки', () => {
  it('находит все звучания слова, без учёта точки и регистра, конец — начало следующего', () => {
    expect(findPhraseOccurrences(wt, 'try')).toEqual([{ start: 1.6, end: 2.4 }, { start: 2.4, end: 2.8 }])
    expect(findPhraseOccurrences(wt, 'i')).toHaveLength(2)
    expect(findPhraseOccurrences(wt, 'nope')).toEqual([])
  })

  it('фраза из двух слов ищется подряд', () => {
    const w = [{ w: 'I', t: 0 }, { w: 'try', t: 0.3 }, { w: 'I', t: 1 }, { w: 'try', t: 1.3 }]
    const occ = findPhraseOccurrences(w, 'I try')
    expect(occ).toHaveLength(2)
    expect(occ[0]).toEqual({ start: 0, end: 1 })
    expect(occ[1].end).toBeCloseTo(1.7)
  })

  it('litWindows: диктор горит по озвучке внутри полёта, ученик и ненайденное — у круга', () => {
    const coach = layer('try', { clips: [{ start: 1, end: 3 }] })   // круг в 2.0, озвучка 1.6–2.4
    const user  = layer('u', { text: 'try', role: 'user', clips: [{ start: 5, end: 7 }] })
    const none  = layer('nope', { clips: [{ start: 1, end: 3 }] })
    const m = litWindows([coach, user, none], wt, wholeFile)
    expect(m.get(shotKey('try', 0))).toEqual({ start: 1.6, end: 2.4 })
    expect(m.get(shotKey('u', 0))).toMatchObject({ fallback: true })
    expect(m.get(shotKey('u', 0)).start).toBeCloseTo(6 - 0.15)
    expect(m.get(shotKey('nope', 0))).toMatchObject({ fallback: true })
  })

  it('нарезка сдвигает окно: кусок файла уехал на таймлайне — окно уехало с ним', () => {
    const clips = [{ id: 'x', at: 5, from: 0, len: 10 }]   // весь файл начинается с 5-й секунды
    const coach = layer('try', { clips: [{ start: 6, end: 8 }] })
    const win = litWindows([coach], wt, clips).get(shotKey('try', 0))
    expect(win.start).toBeCloseTo(6.6)
    expect(win.end).toBeCloseTo(7.4)
  })
})

describe('дорожки экрана', () => {
  it('freeLane — первая, где в это время никто не летит', () => {
    const a = layer('a', { lane: 0, clips: [{ start: 0, end: 2 }] })
    const b = layer('b', { lane: 1, clips: [{ start: 1, end: 3 }] })
    expect(freeLane([a, b], { start: 1.5, end: 2.5 })).toBe(2)
    expect(freeLane([a, b], { start: 4, end: 6 })).toBe(0)
    expect(freeLane([a], { start: 1, end: 2 }, 'a')).toBe(0)   // свои не считаем
  })

  it('laneCollisions помечает оба наложившихся вылета', () => {
    const a = layer('a', { lane: 1, clips: [{ start: 0, end: 2 }] })
    const b = layer('b', { lane: 1, clips: [{ start: 1, end: 3 }] })
    const c = layer('c', { lane: 2, clips: [{ start: 1, end: 3 }] })
    const bad = laneCollisions([a, b, c])
    expect([...bad].sort()).toEqual([shotKey('a', 0), shotKey('b', 0)])
  })
})

describe('autoLayoutCoach', () => {
  it('каждому слою диктора — по вылету на каждое звучание, центр на середине слова; ученика не трогает', () => {
    const coach = layer('try', { clips: [] })
    const user  = layer('u', { text: 'try', role: 'user', clips: [{ start: 8, end: 9 }] })
    const [c, u] = autoLayoutCoach([coach, user], wt, wholeFile, 30)
    expect(c.clips).toHaveLength(1)
    expect(c.repeats).toHaveLength(1)
    expect(hitTime(c.clips[0])).toBeCloseTo(2.0)          // (1.6 + 2.4) / 2
    expect(c.clips[0].end - c.clips[0].start).toBeCloseTo(FLIGHT_S)
    expect(u.clips).toEqual([{ start: 8, end: 9 }])
  })

  it('у начала композиции полёт не уходит в минус', () => {
    const [c] = autoLayoutCoach([layer('i', { clips: [] })], wt, wholeFile, 30)
    expect(c.clips[0].start).toBe(0)
  })
})

describe('дорожка перевода', () => {
  const tr = { id: 'tr', text: 'я пытаюсь', role: 'translation', lane: 0, clips: [{ start: 1, end: 3 }], repeats: [] }
  const word = { id: 'w', text: 'try', translation: 'из слова', role: 'coach', lane: 0, clips: [{ start: 0, end: 2 }], repeats: [] }

  it('показывается ровно на длину клипа, к концу — уход; не летит и не занимает дорожку экрана', () => {
    const { activeTranslation, frameLayout, freeLane } = timing
    expect(activeTranslation([tr, word], 0.5)).toBeNull()             // до клипа перевода
    expect(activeTranslation([tr, word], 1.5)).toMatchObject({ text: 'я пытаюсь', out: false })
    expect(activeTranslation([tr, word], 2.8)).toMatchObject({ out: true })
    expect(activeTranslation([tr, word], 3)).toBeNull()
    expect(frameLayout([tr, word], 1.5).map(w => w.layerId)).toEqual(['w'])
    expect(freeLane([tr], { start: 1, end: 2 })).toBe(0)
  })

  it('без дорожки перевода — запасной вариант из поля слова', () => {
    expect(timing.activeTranslation([word], 1)).toMatchObject({ text: 'из слова' })
  })
})

describe('привязка куска озвучки к слову', () => {
  it('кусок с layerId зажигает слово на пересечении куска и полёта — важнее таймингов', () => {
    const coach = { id: 'w', text: 'try', role: 'coach', lane: 0, clips: [{ start: 1, end: 3 }], repeats: [] }
    const clips = [{ id: 'c', at: 1.5, from: 0, len: 4, layerId: 'w' }]
    const wt = [{ w: 'try', t: 1.0 }, { w: 'x', t: 1.4 }]   // файл 1.0–1.4 → на таймлайне 2.5–2.9
    expect(timing.litWindows([coach], wt, clips).get('w#0')).toEqual({ start: 1.5, end: 3, bound: true })
    // привязан к другому слою — на этот не влияет
    const w = timing.litWindows([coach], wt, [{ ...clips[0], layerId: 'other' }]).get('w#0')
    expect(w.start).toBeCloseTo(2.5)
    expect(w.end).toBeCloseTo(2.9)
    expect(w.bound).toBeUndefined()
  })
})
