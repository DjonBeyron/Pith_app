import { describe, it, expect, beforeEach } from 'vitest'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { buildLegend } from './lessonSchema.js'
import { makeNode } from '../nodeGraph.js'

// Поля озвучки верного ответа: voiceAnswer («Собери фразу»), voiceCorrect и voicePhrase («Выбери слово») — туда-обратно через JSON.
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const node = (type, extra) => {
  const n = makeNode(1, 0, 0, type)
  n.typeData[type] = { ...n.typeData[type], ...extra }
  return n
}
const roundTrip = n => importLesson(JSON.parse(JSON.stringify(exportLesson([n], { title: 'T' })))).nodes[0].typeData

describe('озвучка верного ответа — поля нод', () => {
  it('voiceAnswer: false сохраняется; без поля его нет (по умолчанию озвучка включена)', () => {
    expect(roundTrip(node('phrase_assembly', { words: ['I', 'eat'], voiceAnswer: false })).phrase_assembly.voiceAnswer).toBe(false)
    expect(roundTrip(node('phrase_assembly', { words: ['I', 'eat'] })).phrase_assembly).not.toHaveProperty('voiceAnswer')
  })
  it('voiceCorrect и voicePhrase проходят туда-обратно', () => {
    const wc = roundTrip(node('word_choice', { options: [{ id: 'a', text: 'Нам нужно уйти', isCorrect: true }], voiceCorrect: true, voicePhrase: 'We need to leave' })).word_choice
    expect(wc.voiceCorrect).toBe(true)
    expect(wc.voicePhrase).toBe('We need to leave')
  })
  it('легенда описывает все три поля', () => {
    const l = JSON.stringify(buildLegend())
    for (const f of ['voiceAnswer', 'voiceCorrect', 'voicePhrase']) expect(l).toContain(f)
  })
})
