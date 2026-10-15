import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { lintScene } from '../../scene/v2/sceneLint.js'
import { demoOfficeScene } from '../../scene/v2/demoScenes.js'
import { removeLine, clearTimeline, fromScene } from './builderModel.js'
import { saveBackup, loadBackup } from './draftBackup.js'
import { sandboxState, lintCounts } from './feedTest/feedTestSandbox.js'
import TimelineEditor from './TimelineEditor.jsx'
import TimelineLine from './TimelineLine.jsx'

// Удалить можно ВСЕ реплики: пустой таймлайн — допустимый черновик (линтер: «минимум 2»), задание не висит за краем

const base = () => fromScene({ ...demoOfficeScene, task: { kind: 'repeat', lineIndex: 3 } })
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }

describe('удаление всех реплик: модель', () => {
  it('removeLine удаляет по одной до нуля — без нижней границы', () => {
    let s = base()
    for (let i = s.timeline.length; i > 0; i--) s = removeLine(s, 0)
    expect(s.timeline).toEqual([])
  })
  it('removeLine: номер реплики задания сдвигается; удалили саму реплику — «автоматически»', () => {
    const s = base() // lineIndex 3
    expect(removeLine(s, 0).task.lineIndex).toBe(2)
    expect(removeLine(s, 5).task.lineIndex).toBe(3)
    expect(removeLine(s, 3).task.lineIndex).toBeNull()
    expect(removeLine(s, 99)).toBe(s)
  })
  it('clearTimeline: пусто, задание остаётся, lineIndex → null (не «реплики №4 нет»)', () => {
    const s = clearTimeline(base())
    expect(s.timeline).toEqual([])
    expect(s.task.kind).toBe('repeat')
    expect(s.task.lineIndex).toBeNull()
    expect(clearTimeline(s)).toBe(s)
    expect(lintScene(s).map(x => x.text).join('|')).not.toMatch(/task\.lineIndex/)
  })
  it('нормализация пустого черновика ничего не подкладывает и не падает (и через резервную копию)', () => {
    const s = clearTimeline(base())
    expect(normalizeSceneV2(s).timeline).toEqual([])
    const st = mem()
    expect(saveBackup({ scene: s, savedId: null }, st)).toBe(true)
    expect(loadBackup(st).scene.timeline).toEqual([])
  })
  it('линтер: пустой таймлайн — ошибка «минимум N реплик» (у say/repeat — 1, иначе 2); тест в ленте и «Применить» заблокированы как при любой ошибке', () => {
    const lint = lintScene(clearTimeline(base()))
    const errs = lint.filter(x => x.level === 'error')
    expect(errs.some(x => /^timeline — минимум [12] реплик/.test(x.text))).toBe(true)
    const st = sandboxState({ ...lintCounts(lint), hasScene: true })
    expect(st.canRun).toBe(false)
    // одна реплика — тоже ошибка, две валидные — годная сцена
    const one = lintScene({ ...base(), timeline: base().timeline.slice(0, 1), task: undefined })
    expect(one.some(x => x.level === 'error' && /минимум 2/.test(x.text))).toBe(true)
    const two = lintScene({ ...base(), timeline: base().timeline.slice(0, 2), task: undefined })
    expect(two.some(x => x.level === 'error' && /минимум/.test(x.text))).toBe(false)
  })
})

describe('удаление всех реплик: интерфейс', () => {
  const actions = new Proxy({}, { get: () => () => {} })
  it('кнопка «Удалить реплику» активна всегда — и при двух, и при одной реплике', () => {
    const line = { who: 'a', text: 'Hi.', emotion: 'neutral', pose: 'talk' }
    for (const total of [1, 2, 3]) {
      const html = renderToStaticMarkup(<TimelineLine index={0} line={line} names={{ a: 'A', b: 'B' }} total={total} actions={actions} />)
      expect(html).toMatch(/<button[^>]*aria-label="Удалить реплику"/)
      expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Удалить реплику"/)
      expect(html).not.toMatch(/aria-label="Удалить реплику"[^>]*disabled=""/)
    }
  })
  it('шапка блока: «Удалить все реплики» при наличии реплик; пустой — подсказка, «+ Добавить реплику» на месте', () => {
    const full = renderToStaticMarkup(<TimelineEditor scene={base()} actions={actions} />)
    expect(full).toContain('Удалить все реплики')
    expect(full).not.toMatch(/disabled=""[^>]*>\s*Удалить все реплики/)
    const empty = renderToStaticMarkup(<TimelineEditor scene={clearTimeline(base())} actions={actions} />)
    expect(empty).toContain('Реплик нет')
    expect(empty).toContain('нужно минимум 2')
    expect(empty).toMatch(/disabled=""[^>]*>\s*Удалить все реплики/)
    expect(empty).toMatch(/\+ Добавить реплику/)
    expect(empty).not.toMatch(/disabled=""[^>]*>\s*\+ Добавить реплику/)
  })
})
