import { describe, it, expect } from 'vitest'
import { SEED_RULES } from './lessonRulesSeed.js'
import { exampleNodes } from './exampleNodes.js'
import { lintLesson } from './lessonLint.js'

// Эффективность линтера на собственных примерах правил (PROJECT.md «Порядок в правилах», 2026-10-22): у каждого авто-правила пример
// «нельзя» должен вызывать названный в правиле код линтера, а пример «можно» — нет. Это проверка, что правило не «висит»: код есть,
// пример воспроизводит нарушение, линтер его видит. Исключения перечислены явно — с причиной, а не молча
const codesOf = r => r.text.match(/R-[a-z0-9-]+/g) ?? []
const fired = (nodes, codes) => codes.filter(c => lintLesson(nodes).some(w => w.includes(`[${c}]`)))
const auto = SEED_RULES.filter(r => r.checker === 'auto')

// Проверки по всему уроку (доли, счётчики, части): на примере из 2–6 нод не срабатывают по построению
const LESSON_LEVEL = new Set(['R-task-variety', 'R-voice-share', 'R-pin', 'R-system', 'R-start-menu', 'R-ksta', 'R-smiley', 'R-period', 'R-lowercase', 'R-table', 'R-opener', 'R-wording', 'R-key-mark', 'R-tautology'])
// Проверки структуры, которую пример-строка не выражает: снимок сцены, сигналы say_phrase, массив highlights (его пишет импорт, не автор)
const STRUCTURE = new Set(['R-scene-open', 'R-scene-count', 'R-scene-word', 'R-scene-lines', 'R-scene-task', 'R-scene-middle', 'R-scene-voice', 'R-say-signal', 'R-base', 'R-typo'])
const local = codes => codes.filter(c => !LESSON_LEVEL.has(c) && !STRUCTURE.has(c))

describe('линтер ловит примеры «нельзя» своих правил и молчит на «можно»', () => {
  for (const r of auto) {
    const codes = codesOf(r)
    const expectHit = local(codes)
    it(`${r.title} → ${codes.join(', ')}${expectHit.length ? '' : ' (уровень урока / структура — только «можно»)'}`, () => {
      if (expectHit.length) expect(fired(exampleNodes(r.bad), expectHit), `«нельзя» не вызвало ${expectHit.join('/')}`).not.toEqual([])
      expect(fired(exampleNodes(r.good), codes), '«можно» вызвало код своего же правила').toEqual([])
    })
  }
  it('покрытие: локальных правил с проверяемым примером не меньше 28 из авто-правил (храповик)', () => {
    const covered = auto.filter(r => local(codesOf(r)).length && fired(exampleNodes(r.bad), local(codesOf(r))).length)
    expect(covered.length).toBeGreaterThanOrEqual(28)
  })
})
