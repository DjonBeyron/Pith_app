import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import * as TK from './taskModel.js'
import { speechVerdictText, taskRatio, nearestReference } from './taskModelVoice.js'
import SceneTaskSection from './SceneTaskSection.jsx'
import TaskAnswerTester from './TaskAnswerTester.jsx'
import { buildPrompt } from './aiPrompt.js'
import { lintPath, fieldIdCandidates, fieldSection } from './lintFieldMap.js'
import { panelKeysFor } from './lintPanelMap.js'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'
import { TASK_EXAMPLE_SAY, TASK_EXAMPLE_REPEAT } from '../../scene/v2/sceneLegend.js'

vi.mock('../signals/HelpTip.jsx', () => ({ default: () => <i data-tip="" /> }))

const base = normalizeSceneV2(demoCafeScene)
const say = normalizeSceneV2({ ...demoCafeScene, ...TASK_EXAMPLE_SAY })
const repeat = normalizeSceneV2({ ...demoCafeScene, ...TASK_EXAMPLE_REPEAT })
const noop = new Proxy({}, { get: () => () => {} })

describe('taskModel — голосовые виды', () => {
  it('три вида переключателя; say/repeat включаются как нормализованное поле', () => {
    expect(Object.keys(TK.TASK_KIND_LABEL)).toEqual(['translate', 'say', 'repeat'])
    expect(TK.TASK_KIND_LABEL.say).toBe('Ответь коту')
    expect(TK.TASK_KIND_LABEL.repeat).toBe('Повтори за диктором')
    expect(TK.isVoiceKind('say') && TK.isVoiceKind('repeat') && !TK.isVoiceKind('translate')).toBe(true)
    expect(TK.setTaskKind(base, 'say').task.kind).toBe('say')
    expect(TK.setTaskKind(base, 'repeat').task.kind).toBe('repeat')
    expect('task' in TK.setTaskKind(say, null)).toBe(false)
  })
  it('answers: добавить (не пустой, без повторов, ≤ 8), править (пустая остаётся), удалить', () => {
    let s = TK.setTaskKind(base, 'say')
    expect(TK.addItem(s, 'answers', '  ')).toBe(s)
    s = TK.addItem(s, 'answers', ' Yes, please ')
    expect(s.task.answers).toEqual(['Yes, please'])
    expect(TK.addItem(s, 'answers', 'Yes, please')).toBe(s)
    s = TK.updateItem(s, 'answers', 0, '')
    expect(s.task.answers).toEqual([''])
    s = TK.removeItem(s, 'answers', 0)
    expect(s.task.answers ?? []).toEqual([])
    for (let i = 0; i < 12; i++) s = TK.addItem(s, 'answers', `ответ ${i}`)
    expect(s.task.answers).toHaveLength(8)
  })
  it('keywords: чипы ≤ 12; accept у голосового вида работает так же', () => {
    let s = TK.setTaskKind(base, 'say')
    for (let i = 0; i < 15; i++) s = TK.addItem(s, 'keywords', `слово${i}`)
    expect(s.task.keywords).toHaveLength(12)
    s = TK.removeItem(s, 'keywords', 0)
    expect(s.task.keywords).toHaveLength(11)
    s = TK.addAccept(TK.setTaskKind(base, 'repeat'), 'Nice to meet you')
    expect(s.task.accept).toEqual(['Nice to meet you'])
    expect(TK.addItem(s, 'нет-такого', 'x')).toBe(s)
    expect(TK.updateItem(s, 'answers', 0, 'x')).toBe(s)
  })
  it('порог и «Строго»: правки через updateTask, null сбрасывает', () => {
    let s = TK.updateTask(say, { passRatio: 0.85, strict: true })
    expect(s.task).toMatchObject({ passRatio: 0.85, strict: true })
    expect(taskRatio(s.task)).toBe(0.85)
    s = TK.updateTask(s, { passRatio: null, strict: null })
    expect(s.task.passRatio).toBeUndefined()
    expect(s.task.strict).toBeFalsy()
    expect(taskRatio(s.task)).toBe(0.7)
    expect(TK.updateTask(s, { passRatio: 0.1 }).task.passRatio ?? 0.7).toBeGreaterThanOrEqual(0.5)
  })
  it('тестер say: ответ из списка засчитывается, чужой — нет, ключевое слово тоже', () => {
    const ok = TK.taskPreview(say, 'tea please')
    expect(ok.voice).toBe(true)
    expect(ok.index).toBe(0)
    expect(ok.answers).toContain('Tea, please')
    expect(ok.result.ok).toBe(true)
    expect(speechVerdictText(ok.result, ok.ratio)).toMatch(/^✓ Засчитается/)
    expect(nearestReference(ok.result)).toBe('Tea, please')
    expect(TK.taskPreview(say, 'tea and coffee').result.ok).toBe(true)
    expect(TK.taskPreview(say, 'coffee').result.ok).toBe(false)
    const bad = TK.taskPreview(say, 'the weather is nice')
    expect(bad.result.ok).toBe(false)
    expect(speechVerdictText(bad.result, bad.ratio)).toMatch(/^✗ Не засчитается .*нужно ≥ 70%/)
    expect(TK.taskPreview(say, '   ').result).toBeNull()
    expect(speechVerdictText(null)).toBe('')
  })
  it('тестер repeat: эталон — text реплики, вариант accept тоже; строгий порог режет', () => {
    const p = TK.taskPreview(repeat, 'nice to meet you too')
    expect(p.answers[0]).toBe('Nice to meet you too.')
    expect(p.result.ok).toBe(true)
    expect(TK.taskPreview(repeat, 'nice to meet you').result.ok).toBe(true)
    expect(TK.taskPreview(repeat, 'hello there').result.ok).toBe(false)
    const harsh = TK.updateTask(repeat, { passRatio: 1, strict: true })
    expect(TK.taskPreview(harsh, 'nice to meet').result.ok).toBe(false)
    expect(TK.taskPreview(base, 'x')).toBeNull()
  })
})

describe('SceneTaskSection / TaskAnswerTester — голосовые виды', () => {
  it('переключатель из четырёх кнопок; say — ответы, ключевые слова, accept, порог, «Строго», голосовой тестер', () => {
    const html = renderToStaticMarkup(<SceneTaskSection scene={say} actions={noop} savedId="r1" onFeedTest={() => {}} />)
    for (const t of ['>Нет<', '>Перевод<', '>Ответь коту<', '>Повтори за диктором<']) expect(html).toContain(t)
    for (const id of ['f-task-answers', 'f-task-answers-1', 'f-task-keywords', 'f-task-keywords-0', 'f-task-accept', 'f-task-passRatio', 'f-task-strict', 'f-task-tester', 'f-task-hint']) expect(html).toContain(`id="${id}"`)
    expect(html).toContain('2 / 8')
    expect(html).toContain('type="range"')
    expect(html).toContain('0.7 — как в уроке')
    expect(html).toContain('Что ученик сказал (как распознал бы микрофон)')
    expect(html).toContain('Проверить в ленте…')
    expect(html).not.toContain('Эталон — что повторяет ученик')
  })
  it('repeat: эталон показан текстом реплики, без answers/keywords; без onFeedTest кнопки «Проверить» нет', () => {
    const html = renderToStaticMarkup(<SceneTaskSection scene={repeat} actions={noop} />)
    expect(html).toContain('id="f-task-reference"')
    expect(html).toContain('«Nice to meet you too.»')
    expect(html).not.toContain('f-task-answers')
    expect(html).not.toContain('f-task-keywords')
    expect(html).toContain('id="f-task-accept-0"')
    expect(html).not.toContain('Проверить в ленте…')
  })
  it('тестер: голосовой заголовок и подсказка про эталоны; для перевода прежний', () => {
    expect(renderToStaticMarkup(<TaskAnswerTester scene={say} />)).toContain('Эталонов: 3')
    expect(renderToStaticMarkup(<TaskAnswerTester scene={repeat} />)).toContain('Пробная речь ученика')
  })
})

describe('замечания линтера и промпт — новые пути task', () => {
  it('answers/keywords/passRatio/strict → поля секции и панель task', () => {
    expect(lintPath('task.answers — нужен ответ')).toBe('task.answers')
    expect(fieldIdCandidates('task.answers[1] — пустая строка')).toEqual(['f-task-answers-1', 'f-task-answers', 'f-task'])
    expect(fieldIdCandidates('task.keywords[2] — длинное')).toEqual(['f-task-keywords-2', 'f-task-keywords', 'f-task'])
    expect(fieldIdCandidates('task.passRatio — 0.2 вне 0.5..1')).toEqual(['f-task-passRatio', 'f-task'])
    expect(fieldIdCandidates('task.strict — булево')).toEqual(['f-task-strict', 'f-task'])
    expect(fieldSection('task.keywords[0] — x')).toBe('task')
    for (const t of ['task.answers — x', 'task.keywords[0] — x', 'task.passRatio — x', 'task.strict — x']) expect(panelKeysFor(t)).toEqual(['task'])
    expect(lintPath('timeline[3].text — длинная')).toBe('timeline[3].text')
    expect(fieldIdCandidates('timeline[3].text — x')[0]).toBe('f-timeline-3-text')
  })
  it('промпт с заданием упоминает голосовые виды say/repeat', () => {
    const p = buildPrompt('кофе', { withTask: true })
    expect(p).toContain('"say"')
    expect(p).toContain('"repeat"')
    expect(p).toContain('answers')
    expect(p).toContain('keywords')
  })
})
