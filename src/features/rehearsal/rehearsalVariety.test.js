import { describe, it, expect, vi } from 'vitest'
import { orderWarmup, buildVariety, blindVariety, chunkTranslation, describeVariants, overdueRank, LANE_COUNT } from './rehearsalVariety.js'
import { discernLayout, describeLayout } from './rehearsalDiscern.js'
import { stuckHint, hintEntry, hintAt, sayWordHint, HINT_WORD_GAP_MS } from './rehearsalHints.js'
import { baseLineId } from './rehearsalLines.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { buildActs } from './rehearsalRecipe.js'
import { buildRehearsalStages } from './rehearsalStages.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { warmupWords, normalizePlan } from './rehearsalPlan.js'
import { orderLanes } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { rngFor } from './rehearsalSeed.js'

const seeded = (id, seed) => ({ ...fixturePlan(id), seed })
const SEEDS = Array.from({ length: 40 }, (_, i) => `seed-${i}`)
const word = (text, lapses, due = true, lane = 0) => ({ text, translation: '', due, lapses, confusers: [], lane })
const stagesOf = plan => buildRehearsalStages({ plan, rate: 1, lib: () => null })
const acts = plan => buildActs(plan, { only: null }).acts

// Случайность внутри актов (CONCEPT_REHEARSAL.md §8): что выбирается и что не случайно никогда
describe('воспроизводимость', () => {
  it('одно семя — один и тот же рецепт и стадии дважды (для всех фикстур)', () => {
    for (const id of ['three', 'two', 'one', 'none']) for (const seed of ['a', 'b', 'c']) {
      expect(acts(seeded(id, seed))).toEqual(acts(seeded(id, seed)))
      expect(JSON.stringify(stagesOf(seeded(id, seed)).stages)).toBe(JSON.stringify(stagesOf(seeded(id, seed)).stages)) // в стадиях есть функции (кривые громкости) — сравниваем по данным
      expect(stagesOf(seeded(id, seed)).lanes).toEqual(stagesOf(seeded(id, seed)).lanes)
    }
  })
  it('разные семена — отличия хотя бы в двух актах (разминка, читка, сборка, без текста, различи — по описанию выбора)', () => {
    const d = seed => Object.fromEntries(describeVariants(acts(seeded('three', seed))).split(', ').map(s => [s.split(' ')[0], s]))
    let pairs = 0
    for (let i = 0; i < SEEDS.length - 1; i++) {
      const a = d(SEEDS[i]), b = d(SEEDS[i + 1])
      const diff = Object.keys(a).filter(k => a[k] !== b[k]).length
      expect(diff, `${SEEDS[i]} / ${SEEDS[i + 1]}`).toBeGreaterThanOrEqual(1)
      if (diff >= 2) pairs++
    }
    expect(pairs).toBeGreaterThan(SEEDS.length / 2) // у большинства соседних семян различаются два и больше акта
    const a = d('a'), g = d('g')
    expect(Object.keys(a).filter(k => a[k] !== g[k]).length).toBeGreaterThanOrEqual(2)
  })
  it('порядок актов не случайный, структура ступеней при трёх кусках не меняется, зеркало последнее перед итогом', () => {
    const base = acts(seeded('three', 'x')).map(a => a.id)
    expect(base).toEqual(['warmup', 'read', 'build', 'blind', 'discern', 'take', 'mirror', 'summary'])
    for (const seed of SEEDS) {
      const a = acts(seeded('three', seed))
      expect(a.map(x => x.id), seed).toEqual(base)
      const b = a.find(x => x.id === 'build')
      expect(b.steps.map(s => s.parts), seed).toEqual([[2], [1, 2]]); expect(b.final.parts).toEqual([0, 1, 2])
      expect(a.at(-2).id).toBe('mirror'); expect(a.at(-1).id).toBe('summary')
    }
  })
})

describe('разминка: порядок и дорожки', () => {
  it('первое слово — всегда самое просроченное: должно быть к повтору, больше промахов; при равенстве — первое в плане', () => {
    for (const seed of SEEDS) {
      const w = acts(seeded('three', seed)).find(a => a.id === 'warmup').words
      expect(w[0].text, seed).toBe('learn') // lapses 2 против 1
    }
    const w = [word('a', 1), word('b', 3), word('c', 3), word('d', 0, false)]
    for (const seed of SEEDS) {
      const o = orderWarmup(w, seed)
      expect(o[0].text).toBe('b'); expect(o.map(x => x.text).sort()).toEqual(['a', 'b', 'c', 'd'])
    }
    expect(overdueRank(word('x', 0, true))).toBeGreaterThan(overdueRank(word('y', 99, false))) // «к повтору» важнее числа промахов
    expect(orderWarmup([], 's')).toEqual([])
  })
  it('остальные слова — в случайном порядке: по семенам встречаются разные порядки', () => {
    const w = ['b', 'c', 'd', 'e'].map(t => word(t, 0)).concat(word('a', 5))
    expect(new Set(SEEDS.map(s => orderWarmup(w, s).map(x => x.text).join(''))).size).toBeGreaterThan(5)
  })
  it('дорожка слова — одна из трёх, не та же, что у предыдущего слова; idx — номер слова в плане, chunkLane — где оно стоит во фразе', () => {
    const seen = new Set()
    for (const seed of SEEDS) {
      const o = orderWarmup(warmupWords(fixturePlan('three')), seed)
      o.forEach((x, i) => { expect(x.lane).toBeGreaterThanOrEqual(0); expect(x.lane).toBeLessThan(LANE_COUNT); if (i) expect(x.lane).not.toBe(o[i - 1].lane); seen.add(x.lane) })
      expect(o.map(x => [x.text, x.idx, x.chunkLane]).sort()).toEqual([['learn', 1, 2], ['trying', 0, 1]])
    }
    expect(seen).toEqual(new Set([0, 1, 2])) // не всегда «своя» дорожка
  })
  it('одно слово — дорожка по центру, как раньше', () => {
    for (const seed of SEEDS) expect(acts(seeded('one', seed))[0].words.map(w => w.lane)).toEqual([1])
  })
})

describe('сборка с конца', () => {
  it('«чётко», потом «обычно» — всегда в этом порядке (реплика «обычно» начинается с «И ещё раз»); теги и sid стоят за своими проходами', () => {
    for (const seed of SEEDS) {
      const p = acts(seeded('three', seed)).find(a => a.id === 'build').final.passes
      expect(p.map(x => x.id)).toEqual(['build-clear', 'build-normal'])
      expect(p[0].tag).toBe('Чётко — для последнего ряда'); expect(p[1].tag).toBe('Обычно')
      expect(baseLineId(p[0].line)).toBe('rh_clear'); expect(p[1].line).toBe('rh_normal')
      const st = stagesOf(seeded('three', seed)).stages.filter(s => s.sid.startsWith('build-') && s.type === 'student' && /clear|normal/.test(s.sid))
      expect(st.map(s => s.sid)).toEqual(p.map(x => x.id))
    }
    expect(Object.keys(buildVariety(3, 'x'))).toEqual(['altStart']) // порядок проходов больше не выбирается
  })
  it('два куска: первая ступень иногда [1], иногда [0], потом [0,1]; один и три куска — структура не меняется', () => {
    const first = new Set()
    for (const seed of SEEDS) {
      const b = acts(seeded('two', seed)).find(a => a.id === 'build')
      expect(b.steps).toHaveLength(1); expect(b.final.parts).toEqual([0, 1]); first.add(b.steps[0].parts.join())
      expect(buildVariety(3, seed).altStart).toBe(false); expect(buildVariety(1, seed).altStart).toBe(false)
    }
    expect(first).toEqual(new Set(['0', '1']))
  })
})

describe('без текста: подсказки «застрял»', () => {
  it('какая подсказка первая — слово или перевод куска — случайно; второй проход — в обратном порядке', () => {
    const first = new Set()
    for (const seed of SEEDS) {
      const [p0, p1] = acts(seeded('three', seed)).find(a => a.id === 'blind').passes
      expect([...p0.hintKinds].sort()).toEqual(['tr', 'word']); expect(p1.hintKinds).toEqual([...p0.hintKinds].reverse()); first.add(p0.hintKinds[0])
    }
    expect(first).toEqual(new Set(['word', 'tr']))
  })
  it('перевод куска: слово плана из первого куска с переводом, иначе перевод фразы; нет перевода — только «слово»', () => {
    expect(chunkTranslation(fixturePlan('three'))).toBe('Я пытаюсь научиться')
    expect(chunkTranslation(normalizePlan({ phrase: 'trying | to learn', translation: 'x', words: [{ text: 'trying', translation: 'пытаюсь' }] }))).toBe('пытаюсь')
    const bare = normalizePlan({ phrase: 'a | b', seed: 's' })
    expect(blindVariety(bare)).toEqual({ kinds: ['word'], reversed: ['word'], tr: '' })
  })
  it('stuckHint: n-я подсказка по порядку ступени; без перевода и без списка — слово; hintEntry/hintAt кладут её в подписи дорожки', () => {
    const st = { hintKinds: ['tr', 'word'], hintTr: 'Я пытаюсь', hintWord: "I'm", hintLane: 0 }
    expect(stuckHint(st, 0)).toEqual({ kind: 'tr', lane: 0, text: 'Я пытаюсь' })
    expect(stuckHint(st, 1)).toEqual({ kind: 'word', lane: 0, word: "I'm", text: "I'm" })
    expect(stuckHint({ ...st, hintTr: '' }, 0).kind).toBe('word'); expect(stuckHint({ hintWord: 'x' }, 3).kind).toBe('word')
    expect(hintEntry(stuckHint(st, 0))).toEqual({ lane: 0, text: 'Я пытаюсь' }); expect(hintEntry(stuckHint(st, 1))).toBe(0)
    expect(hintAt([{ lane: 2, text: 'q' }], 2)).toEqual({ lane: 2, text: 'q' }); expect(hintAt([0], 0)).toBe(0); expect(hintAt([1], 0)).toBeUndefined()
  })
})

describe('«Различи»: двойник и дорожки', () => {
  const learn = { text: 'learn', confusers: ['earn', 'lean'] }
  it('первая подсказка — слово и один случайный двойник, вторая — слово и оба; верное слово на разных дорожках в двух подсказках', () => {
    const doubles = new Set(), answers = new Set()
    for (const seed of SEEDS) {
      const [a, b] = discernLayout(learn, seed, 0)
      const shown = p => p.texts.filter(Boolean).sort()
      expect(shown(a)).toHaveLength(2); doubles.add(shown(a).find(t => t !== 'learn')); expect(shown(b)).toEqual(['earn', 'lean', 'learn'])
      expect(a.slots).toEqual([0, 2]); expect(b.slots).toEqual([0, 1, 2])
      for (const p of [a, b]) { expect(p.texts[p.answer[0]]).toBe('learn'); expect(p.slots).toContain(p.answer[0]); answers.add(p.answer[0]) }
      expect(a.answer[0]).not.toBe(b.answer[0])
    }
    expect(doubles).toEqual(new Set(['earn', 'lean'])); expect(answers).toEqual(new Set([0, 1, 2]))
  })
  it('один двойник — две дорожки (0 и 2), верная на разных; без двойников подсказок нет; формат как у discernPrompts', () => {
    const one = discernLayout({ text: 'remember', confusers: ['remind'] }, 's', 0)
    expect(one).toHaveLength(2); expect(one.every(p => p.slots.join() === '0,2')).toBe(true); expect(one[0].answer[0]).not.toBe(one[1].answer[0])
    expect(discernLayout({ text: 'x', confusers: [] }, 's', 0)).toEqual([])
    expect(one[0]).toMatchObject({ id: 'discern-0-0', parts: [0], text: 'remember' }); expect(one[0].stagger).toBeGreaterThan(0); expect(one[0].lead).toBeGreaterThan(0)
    expect(describeLayout(one)).toMatch(/^remind→[02], remind→[02]$/)
  })
  it('ряд дорожек раунда перемешан по семени (orderLanes с rng) и всё равно не естественный; без rng — как раньше', () => {
    expect(orderLanes(3)).toEqual([2, 0, 1]); expect(orderLanes(2)).toEqual([1, 0]); expect(orderLanes(1, rngFor('s'))).toEqual([0])
    const seen = new Set()
    for (const seed of SEEDS) {
      const l = orderLanes(3, rngFor(seed, 'lanes')); seen.add(l.join())
      expect([...l].sort()).toEqual([0, 1, 2]); expect(l.some((c, i) => c !== i)).toBe(true)
      expect(stagesOf(seeded('three', seed)).lanes).toEqual(orderLanes(3, rngFor(seed, 'lanes')))
    }
    expect(seen.size).toBeGreaterThan(2)
    for (const seed of SEEDS) expect(orderLanes(2, rngFor(seed))).toEqual([1, 0])
  })
  it('в стадиях раскладка берётся из акта: те же подсказки, что в рецепте', () => {
    const plan = seeded('three', 'd')
    const d = stagesOf(plan).stages.find(s => s.type === 'discern')
    expect(d.prompts).toEqual(acts(plan).find(a => a.id === 'discern').words[0].prompts)
  })
})

describe('голос подсказки «Начни с слово»', () => {
  const voiced = (o = {}) => normalizeLines({ lines: { rh_blind_hint_pre: { text: 'Начни с', url: 'u/pre.mp3', duration: 0.6, ...o } } })
  it('есть озвучка «Начни с»: сначала она (подпись целиком), слово — после неё и паузы', () => {
    const sayLine = vi.fn(() => true), sayText = vi.fn(), setTimer = vi.fn(() => 7)
    expect(sayWordHint({ word: "I'm", lines: voiced(), rate: 1, sayLine, sayText, setTimer })).toBe(7)
    expect(sayLine).toHaveBeenCalledTimes(1); expect(sayLine).toHaveBeenCalledWith('rh_blind_hint_pre', { caption: "Начни с I'm" })
    expect(sayText).not.toHaveBeenCalled(); expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 600 + HINT_WORD_GAP_MS)
    setTimer.mock.calls[0][0](); expect(sayText).toHaveBeenCalledWith("I'm")
  })
  it('скорость голоса урока укорачивает паузу до слова', () => {
    const setTimer = vi.fn(() => 1)
    sayWordHint({ word: 'x', lines: voiced(), rate: 2, sayLine: () => true, sayText() {}, setTimer })
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 300 + HINT_WORD_GAP_MS)
  })
  it('нет озвучки «Начни с» или Пит занят — как раньше: подпись «Начни с слово» и только слово сразу', () => {
    for (const lines of [normalizeLines(null), voiced()]) {
      const sayLine = vi.fn(() => false), sayText = vi.fn(), setTimer = vi.fn()
      expect(sayWordHint({ word: 'go', lines, rate: 1, sayLine, sayText, setTimer })).toBe(0)
      expect(sayLine).toHaveBeenLastCalledWith('rh_blind_hint', { word: 'go' }); expect(sayText).toHaveBeenCalledWith('go'); expect(setTimer).not.toHaveBeenCalled()
    }
    expect(baseLineId('rh_blind_hint_pre')).toBe('rh_blind_hint_pre')
  })
})
