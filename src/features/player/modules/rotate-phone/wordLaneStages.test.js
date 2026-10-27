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
  it('длины кусков и кривые громкости берутся из плана одиночного куска (по ним ученик и тень)', () => {
    const s = buildStages({ chunks, clips, audio: { wave, duration: 10 } })
    expect(s.chunkMs).toHaveLength(3)
    expect(s.chunkMs.every(ms => ms >= 250)).toBe(true)
    expect(s.chunkCurves.every(c => typeof c === 'function')).toBe(true)
    expect(buildStages({ chunks }).chunkCurves.every(c => c === null)).toBe(true)
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
})
