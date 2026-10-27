import { describe, it, expect } from 'vitest'
import { buildStages, listenStepOf, labelsFor, ANNOUNCE_MS } from './wordLaneStages.js'
import { clipsFromTimings, utterances } from './wordLaneAudio.js'

const chunks = ["I'm", 'trying', 'to learn']
const wordsOf = cs => utterances(cs.length).flatMap(p => p.flatMap(i => cs[i].split(/\s+/)))
const clips = clipsFromTimings(wordsOf(chunks).map((w, i) => ({ w, t: 0.3 + i * 0.5, e: 0.3 + i * 0.5 + 0.4 })), chunks, 10)
const wave = Array.from({ length: 400 }, (_, i) => (i % 20 < 8 ? 200 : 10))
const types = s => s.stages.map(x => x.type)

describe('стадии игры', () => {
  it('фраза из трёх кусков: анонс → 5 ступеней наращивания (диктор, твоя очередь, ученик) → анонс → порядок → анонс → вслепую (2 ступени ученика)', () => {
    const s = buildStages({ chunks, clips })
    expect(types(s)).toEqual([
      'announce', ...Array(5).fill(['dictor', 'turn', 'student']).flat(),
      'announce', 'order',
      'announce', 'student', 'student',
    ])
    s.stages.forEach((x, i) => expect(x.idx).toBe(i))
    expect(s.stages[0].ms).toBe(ANNOUNCE_MS)
  })
  it('одно слово: без анонсов и без «Порядка» с «вслепую» — диктор, твоя очередь, ученик', () => {
    const s = buildStages({ chunks: ['try'] })
    expect(types(s)).toEqual(['dictor', 'turn', 'student'])
    expect(s.lanes).toEqual([0])
  })
  it('у фразы запись автора — только в ФИНАЛЕ, куски по отдельности — из библиотеки слов: длины кусков берутся из библиотеки, кривых громкости у них нет', () => {
    const lib = i => ({ ms: [600, 750, 900][i] })
    const s = buildStages({ chunks, clips, audio: { wave, duration: 10 }, lib })
    expect(s.chunkMs).toEqual([600, 750, 900])
    expect(s.chunkCurves.every(c => c === null)).toBe(true)
    const plans = s.stages.filter(x => x.type === 'dictor').map(x => x.plan)
    expect(plans.slice(0, 4).every(p => p.reps.every(r => r.mode === 'words'))).toBe(true)     // «I'm», «trying», «I'm trying», «to learn» — куски из библиотеки
    expect(plans[4].reps.every(r => r.mode === 'clip')).toBe(true)                            // вся фраза — запись автора
    expect(plans[4].pills[0].curve).toBeTypeOf('function')
    expect(s.clipMode([0, 1, 2])).toBe(true)
    expect(s.clipMode([0, 1])).toBe(false)
  })
  it('нет записи автора — финал тоже из кусков библиотеки; одно слово: библиотека, а нет её — запись автора', () => {
    const s = buildStages({ chunks, lib: () => ({ ms: 500 }) })
    expect(s.stages.filter(x => x.type === 'dictor').every(x => x.plan.reps.every(r => r.mode === 'words'))).toBe(true)
    const fills = [{ start: 0.3, end: 0.8 }, { start: 1.6, end: 2.1 }, { start: 3.1, end: 3.6 }].map(f => [f])
    expect(buildStages({ chunks: ['try'], clips: fills, lib: () => ({ ms: 400 }) }).stages[0].plan.reps[0].mode).toBe('words')
    expect(buildStages({ chunks: ['try'], clips: fills, lib: () => null }).stages[0].plan.reps[0].mode).toBe('clip')
  })
  it('слушатель стартует заранее: под плашкой «твоя очередь» и под анонсом раунда «вслепую»', () => {
    const s = buildStages({ chunks, clips })
    const turn = s.stages.find(x => x.type === 'turn')
    expect(listenStepOf(s.stages, turn.idx)).toBe(turn.step)
    expect(listenStepOf(s.stages, turn.idx - 1)).toBeNull()           // под диктором слушатель не нужен
    const blindAnnounce = s.stages.findLastIndex(x => x.type === 'announce')
    expect(listenStepOf(s.stages, blindAnnounce)).toBe(s.stages[blindAnnounce + 1].step)
    expect(listenStepOf(s.stages, s.stages.find(x => x.type === 'order').idx)).toBeNull()
  })
})

describe('подписи дорожек', () => {
  const s = buildStages({ chunks, clips })
  it('наращивание: подписаны все куски, подсвечены куски ступени', () => {
    const stage = s.stages.find(x => x.type === 'dictor' && x.step.parts.join('') === '01')
    expect(labelsFor(stage, chunks, s.lanes)).toEqual([{ text: "I'm", on: true }, { text: 'trying', on: true }, { text: 'to learn', on: false }])
  })
  it('порядок: подписи по перемешанным дорожкам; вслепую: подписей нет, пока не подсказали', () => {
    const order = s.stages.find(x => x.type === 'order')
    expect(labelsFor(order, chunks, s.lanes).map(l => l.text)).toEqual(s.lanes.map(c => chunks[c]))
    const blind = s.stages.findLast(x => x.type === 'student')
    expect(labelsFor(blind, chunks, s.lanes).every(l => l.text === '')).toBe(true)
    expect(labelsFor(blind, chunks, s.lanes, [1])[1]).toEqual({ text: 'trying', on: true })    // подсказка после «не успел»
  })
  it('одно слово — подписей дорожек нет (слово над дорожками, как раньше)', () => {
    const one = buildStages({ chunks: ['try'] })
    expect(labelsFor(one.stages[0], ['try'], one.lanes).every(l => l.text === '')).toBe(true)
  })

  it('«Различи»: стадия с подсказками (слова на пилюлях, по очереди), над дорожками подписей нет; без запутывателей стадий нет', () => {
    const chunks = ["I'm", 'trying', 'to learn']
    expect(buildStages({ chunks }).stages.some(x => x.type === 'discern')).toBe(false)
    const b = buildStages({ chunks, confusers: [[], ['tying', 'drying'], []] })
    const st = b.stages.find(x => x.type === 'discern')
    expect(st.prompts).toHaveLength(2)
    expect(st.prompts[0].stagger).toBeGreaterThan(0)
    expect(st.prompts[0].words.slice().sort()).toEqual(['drying', 'trying', 'tying'])
    expect(b.stages[st.idx - 1].type).toBe('announce')
    expect(labelsFor(st, chunks, b.lanes).every(l => !l.text && !l.on)).toBe(true)      // верное слово над дорожками не выдаём
    const one = buildStages({ chunks: ['try'], confusers: [['tray']] })              // у одного слова плашка — только перед «Различи»
    expect(one.stages.filter(x => x.type === 'announce')).toHaveLength(1)
  })
})
