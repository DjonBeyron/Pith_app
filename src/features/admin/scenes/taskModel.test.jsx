import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import * as TK from './taskModel.js'
import SceneTaskSection from './SceneTaskSection.jsx'
import TaskAnswerTester from './TaskAnswerTester.jsx'
import { buildPrompt } from './aiPrompt.js'
import { lintPath, fieldIdCandidates, fieldSection } from './lintFieldMap.js'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'
import { TASK_EXAMPLE } from '../../scene/v2/sceneLegend.js'

vi.mock('../signals/HelpTip.jsx', () => ({ default: () => <i data-tip="" /> }))

const base = normalizeSceneV2(demoCafeScene)
const withTask = normalizeSceneV2({ ...demoCafeScene, ...TASK_EXAMPLE })
const noop = new Proxy({}, { get: () => () => {} })

describe('taskModel — секция «Задание после сцены»', () => {
  it('включить/выключить: kind translate добавляет нормализованное поле, null убирает его целиком', () => {
    const on = TK.setTaskKind(base, 'translate')
    expect(on.task).toEqual({ kind: 'translate', lineIndex: null, accept: [] })
    expect(TK.taskKind(on)).toBe('translate')
    const off = TK.setTaskKind(on, null)
    expect('task' in off).toBe(false)
    expect(TK.setTaskKind(base, null)).toBe(base)
    expect(TK.setTaskKind(base, 'quiz')).toBe(base)
  })
  it('правки: lineIndex/prompt/hint, пустые строки убирают поле; без задания — сцена как была', () => {
    let s = TK.setTaskKind(base, 'translate')
    s = TK.updateTask(s, { lineIndex: 2, prompt: ' Что? ', hint: 'х' })
    expect(s.task).toMatchObject({ lineIndex: 2, prompt: 'Что?', hint: 'х' })
    s = TK.updateTask(s, { prompt: '', lineIndex: null })
    expect('prompt' in s.task).toBe(false)
    expect(s.task.lineIndex).toBeNull()
    expect(TK.updateTask(base, { prompt: 'x' })).toBe(base)
  })
  it('варианты ответа: добавить (не пустой, ≤ 8), править (пустая строка остаётся до удаления), удалить', () => {
    let s = TK.setTaskKind(base, 'translate')
    expect(TK.addAccept(s, '   ')).toBe(s)
    s = TK.addAccept(s, ' раз ')
    s = TK.addAccept(s, 'два')
    expect(s.task.accept).toEqual(['раз', 'два'])
    s = TK.updateAccept(s, 1, '')
    expect(s.task.accept).toEqual(['раз', ''])
    s = TK.removeAccept(s, 1)
    expect(s.task.accept).toEqual(['раз'])
    for (let i = 0; i < 10; i++) s = TK.addAccept(s, `в${i}`)
    expect(s.task.accept).toHaveLength(8)
  })
  it('тестер: превью целевой реплики и вердикт по ответу', () => {
    expect(TK.taskPreview(base)).toBeNull()
    const p = TK.taskPreview(withTask, 'он не большой, просто чашка маленькая')
    expect(p.index).toBe(1)
    expect(p.prompt).toBe('Что ответил Барсик?')
    expect(p.answers).toHaveLength(3)
    expect(p.result.ok).toBe(true)
    expect(TK.verdictText(p.result)).toMatch(/^✓ Засчитается/)
    const bad = TK.taskPreview(withTask, 'ведро').result
    expect(TK.verdictText(bad)).toMatch(/^✗ Не засчитается .*не хватает/)
    expect(TK.verdictText(TK.taskPreview(withTask, '').result)).toBe('')
  })
})

describe('SceneTaskSection / TaskAnswerTester — разметка', () => {
  it('без задания — переключатель «Нет» включён и пояснение; с заданием — реплика, вопрос, варианты, подсказка, тестер, «Показать в ленте»', () => {
    const off = renderToStaticMarkup(<SceneTaskSection scene={base} actions={noop} />)
    expect(off).toContain('id="f-task"')
    expect(off).toContain('Без задания сцена в ленте просто идёт по кругу')
    expect(off).not.toContain('f-task-lineIndex')
    const on = renderToStaticMarkup(<SceneTaskSection scene={withTask} actions={noop} savedId="row-1" />)
    expect(on).toContain('id="f-task-lineIndex"')
    expect(on).toContain('id="f-task-prompt"')
    expect(on).toContain('id="f-task-accept-1"')
    expect(on).toContain('id="f-task-hint"')
    expect(on).toContain('id="f-task-tester"')
    expect(on).toContain('Что ответил Барсик?')
    expect(on).toContain('2 / 8')
    expect(on).toMatch(/Показать в ленте<\/button>/)
    const unsaved = renderToStaticMarkup(<SceneTaskSection scene={withTask} actions={noop} />)
    expect(unsaved).toMatch(/disabled=""[^>]*title="Сначала сохраните/)
  })
  it('тестер без эталонов объясняет, что добавить', () => {
    const s = normalizeSceneV2({ ...demoCafeScene, task: { kind: 'translate' } })
    expect(renderToStaticMarkup(<TaskAnswerTester scene={s} />)).toContain('Эталонов нет')
    expect(renderToStaticMarkup(<TaskAnswerTester scene={withTask} />)).toContain('Эталонов: 3')
  })
  it('замечания линтера про task ведут к полям секции; промпт с заданием просит translation и task', () => {
    expect(lintPath('task.accept — нет синонимичных переводов')).toBe('task.accept')
    expect(fieldIdCandidates('task.lineIndex — реплика не выбрана')).toEqual(['f-task-lineIndex', 'f-task'])
    expect(fieldSection('task — у реплики №2 нет перевода')).toBe('task')
    expect(buildPrompt('кофе')).not.toContain('translation')
    expect(buildPrompt('кофе', { withTask: true })).toContain('translation')
    expect(buildPrompt('кофе', { withTask: true })).toContain('"translate"')
  })
})
