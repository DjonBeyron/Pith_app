import { describe, it, expect, beforeEach } from 'vitest'
import { exportLessonText } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { lintLesson } from './lessonLint.js'
import { buildLegend } from './lessonSchema.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

// Принудительные переносы строки \n в «Составь предложение» (фраза и перевод)
// проходят через экспорт/импорт JSON урока без потерь, линтер их не режет
const TEMPLATE = 'He tr___s\na new recipe\nevery ___.'
const TRANSLATION = 'Он пробует\nновый рецепт\nкаждую ___.'

const lessonNodes = () => [{
  id: 'a', seq: 1, x: 0, y: 0, size: 'max', type: 'fill_blanks',
  typeData: { fill_blanks: {
    template: TEMPLATE, translation: TRANSLATION,
    blanks: [{ options: ['ie', 'y'], answer: 'ie' }, { options: ['week', 'day'], answer: 'week' }],
  } },
  triggers: [],
}]

describe('fill_blanks: \\n в фразе и переводе через JSON урока', () => {
  it('экспорт → импорт: переносы на месте, текст байт-в-байт', () => {
    const text = exportLessonText(lessonNodes(), { title: 'X' })
    expect(text).toContain('\\n') // в JSON-файле это экранированный \n, не сырой перенос в строке
    const fb = importLesson(text).nodes[0].typeData.fill_blanks
    expect(fb.template).toBe(TEMPLATE)
    expect(fb.translation).toBe(TRANSLATION)
  })

  it('линтер не режет переносы и не придирается к ним', () => {
    const exported = JSON.parse(exportLessonText(lessonNodes(), { title: 'X' }))
    expect(lintLesson(exported.nodes)).toEqual([])
  })

  it('легенда рассказывает автору про \\n в template и translation', () => {
    const f = buildLegend().nodes.fill_blanks.fields
    expect(f.template).toContain('\\n')
    expect(f.translation).toContain('\\n')
  })
})
