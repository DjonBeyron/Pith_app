import { describe, it, expect } from 'vitest'
import { buildPhrases, buildExtraWords, PHRASES_MIN, PHRASES_MAX, EXTRA_MAX } from './racePhrasePool.js'
import { firstModules, standbyPhrases } from './raceStandbyPhrases.js'
import { CURRICULA, BASE, row, deps } from './racePlanTestData.js'

const OTHER = { phrase: "I'm | trying | to learn", chunks: ["I'm", 'trying', 'to learn'], translation: 'Я пытаюсь научиться', words: [], seed: 's1' }
const ids = list => list.map(p => p.id)

describe('фразы плана из памяти: минимум три, текущая первой', () => {
  it('0 своих: текущая из плана (модуля нет) + две дежурные', () => {
    const p = buildPhrases({ base: OTHER, deps: deps() })
    expect(p).toHaveLength(PHRASES_MIN)
    expect(p[0]).toMatchObject({ id: 'plan:i am trying to learn', own: true, ru: 'Я пытаюсь научиться' })
    expect(ids(p.slice(1))).toEqual(['m3', 'm1'])
    expect(p.slice(1).every(x => !x.own)).toBe(true)
  })
  it('текущая фраза — модуль с той же фразой; дежурные без неё', () => {
    const p = buildPhrases({ base: BASE, deps: deps() })
    expect(ids(p)).toEqual(['m1', 'm3', 'm5'])
    expect(p.map(x => x.own)).toEqual([true, false, false])
  })
  it('currentId важнее совпадения по тексту', () => {
    expect(buildPhrases({ base: BASE, deps: deps({ currentId: 'm4' }) })[0].id).toBe('m4')
  })
  it('1 своя (слово в памяти) + текущая + одна дежурная', () => {
    const p = buildPhrases({ base: BASE, deps: deps({ memory: [row('morning', 2)] }) })
    expect(ids(p)).toEqual(['m1', 'm4', 'm3'])
    expect(p.map(x => x.own)).toEqual([true, true, false])
  })
  it('2 своих (начатый модуль и закреплённая фраза) — дежурных нет', () => {
    const p = buildPhrases({ base: BASE, deps: deps({ startedIds: ['m4'], phraseRows: [{ module_id: 'm6' }] }) })
    expect(p).toHaveLength(3)
    expect(p.every(x => x.own)).toBe(true)
  })
  it('не больше шести; неопубликованный модуль не берётся', () => {
    const p = buildPhrases({ base: BASE, deps: deps({ memory: [row('you', 3), row('good', 3)] }) })
    expect(p).toHaveLength(PHRASES_MAX)
    expect(ids(p)).not.toContain('m7')
    expect(p[0].id).toBe('m1')
  })
  it('свои: сначала со слабыми словами, потом по уровню', () => {
    const p = buildPhrases({ base: BASE, deps: deps({ memory: [row('morning', 5), row('later', 1)] }) })
    expect(ids(p)).toEqual(['m1', 'm6', 'm4'])
  })
  it('без сети (модулей нет) — запасные фразы, всё равно три', () => {
    const p = buildPhrases({ base: OTHER, deps: deps({ curricula: [], lessons: [] }) })
    expect(p).toHaveLength(3)
    expect(p.slice(1).every(x => x.id.startsWith('reserve:') && x.words.every(w => w.translation))).toBe(true)
  })
})

describe('дежурные фразы = первые три опубликованных по created_at', () => {
  it('порядок по дате, а не по id; черновик пропущен', () => {
    expect(ids(firstModules(CURRICULA))).toEqual(['m3', 'm1', 'm5'])
    expect(standbyPhrases(CURRICULA, {}).slice(0, 3).every(p => !p.own)).toBe(true)
  })
})

describe('поля фразы', () => {
  it('слова из уроков модуля, переводы из word_translations, уровни из памяти', () => {
    const [m1] = buildPhrases({ base: BASE, deps: deps({ memory: [row('meet', 3), row('nice', 5, { settled_on: '2026-10-01' })] }) })
    expect(m1.words).toEqual([
      { text: 'nice', translation: 'пер-nice', level: 4 },
      { text: 'meet', translation: 'пер-meet', level: 2 },
      { text: 'you', translation: 'пер-you', level: 0 },
    ])
    expect(m1.level).toBe(0)
    expect(m1.key).toBe('nice to meet you')
  })
  it('без уроков — слова из word_translations', () => {
    const [m1] = buildPhrases({ base: BASE, deps: deps({ lessons: [] }) })
    expect(m1.words.map(w => w.text)).toEqual(['nice', 'meet', 'you'])
  })
  it('ru: race_phrase_ru → title_translation → пусто', () => {
    const ruMap = { 'nice to meet you': 'скажи, что рад знакомству' }
    expect(buildPhrases({ base: BASE, deps: deps({ ruMap }) })[0].ru).toBe('скажи, что рад знакомству')
    expect(buildPhrases({ base: BASE, deps: deps() })[0].ru).toBe('перевод Nice to meet you')
    const bare = CURRICULA.map(m => ({ ...m, title_translation: null }))
    expect(buildPhrases({ base: BASE, deps: deps({ curricula: bare }) })[0].ru).toBe('')
  })
  it('audio: из game2_phrases, иначе null', () => {
    const audioMap = { 'rh2_phrase:nice to meet you': { url: 'https://x/a.mp3', duration: 1.4 }, 'rh2_phrase:how old are you': { url: '' } }
    const p = buildPhrases({ base: BASE, deps: deps({ audioMap }) })
    expect(p[0].audio).toEqual({ url: 'https://x/a.mp3', duration: 1.4 })
    expect(p[1].audio).toBeNull()
  })
  it('детерминизм: одни данные и семя — один результат', () => {
    const d = deps({ memory: ['you', 'good', 'later', 'old'].map(w => row(w, 3)) })
    expect(buildPhrases({ base: BASE, deps: d })).toEqual(buildPhrases({ base: BASE, deps: d }))
    expect(buildExtraWords({ base: BASE, deps: d })).toEqual(buildExtraWords({ base: BASE, deps: d }))
  })
})

describe('extraWords', () => {
  it('слова памяти с переводом, без слов фразы плана, просроченные и низкие первыми, ≤ 12', () => {
    const many = ['where', 'from', 'how', 'old', 'good', 'morning', 'thank', 'see', 'later'].map((w, i) => row(w, 1 + (i % 5)))
    const extra = buildExtraWords({ base: BASE, deps: deps({ memory: [...many, row('meet', 1), row('later2', 1), row('see', 5, { due_on: '2026-11-01' })] }) })
    expect(extra.length).toBeLessThanOrEqual(EXTRA_MAX)
    expect(extra.map(w => w.text)).not.toContain('meet')
    expect(extra.map(w => w.text)).not.toContain('later2') // нет перевода
    expect(extra.find(w => w.text === 'see').due).toBe(false) // слово в памяти дважды — берётся первая строка
    const levels = extra.map(w => w.level)
    expect([...levels].sort((a, b) => a - b)).toEqual(levels)
  })
  it('просроченное слово первым', () => {
    const extra = buildExtraWords({ base: BASE, deps: deps({ memory: [row('good', 1), row('old', 4, { due_on: '2026-11-01', lapses: 2 })] }) })
    expect(extra[0]).toEqual({ text: 'old', translation: 'пер-old', level: 2, due: true, lapses: 2 })
  })
  it('меньше шести — добор словами дежурных фраз до шести', () => {
    const extra = buildExtraWords({ base: OTHER, deps: deps({ memory: [row('morning', 2)] }) })
    expect(extra).toHaveLength(6)
    expect(extra[0].text).toBe('morning')
    expect(extra.slice(1).map(w => w.text)).toEqual(['how', 'old', 'you', 'nice', 'meet'])
    expect(extra.every(w => w.translation)).toBe(true)
  })
})
