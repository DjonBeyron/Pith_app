import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneTabRow from './SceneTabRow.jsx'
import SceneRowActions from './SceneRowActions.jsx'
import SceneTabSummary from './SceneTabSummary.jsx'
import SceneTabEmpty from './SceneTabEmpty.jsx'
import SceneModuleBlock from './SceneModuleBlock.jsx'
import { buildSceneRows, sceneBase } from './sceneRows.js'
import { sceneTabBadge } from './useSceneRows.js'
import { fixtureNodes, sceneNode } from './sceneTabFixtures.js'
import { demoOfficeScene } from '../../scene/v2/demoScenes.js'

const handlers = { edit: vi.fn(), go: vi.fn(), play: vi.fn(), dup: vi.fn(), del: vi.fn() }
const html = row => renderToStaticMarkup(<ul><SceneTabRow row={row} handlers={handlers} busy={false} /></ul>)

describe('строка вкладки «Сцены»', () => {
  const { rows } = buildSceneRows(fixtureNodes(), { title: 'try' })

  it('динамичная: чип «Динамичная · слов: 1», тип слов и запасное слово, «?» у чипа', () => {
    const h = html(rows[2])
    expect(h).toContain('Динамичная · слов: 1')
    expect(h).toContain('{food} · новые · запас: a sandwich')
    expect(h).toContain('Что это? Динамичная сцена')
    expect(h).toContain('№5')
    expect(h).toContain('Кружок')
    expect(h).toContain('Пит (один кот)')
  })

  it('статичная: чип «Статичная», режим «Пузырь», число реплик, «нет озвучки»', () => {
    const h = html(rows[1])
    expect(h).toContain('Статичная')
    expect(h).not.toContain('Динамичная')
    expect(h).toContain('Пузырь')
    expect(h).toContain(`${demoOfficeScene.timeline.length} реплик`)
    expect(h).toContain('нет озвучки')
    expect(h).toContain('Что это? Статичная сцена')
  })

  it('все пять действий — кнопки с aria-label и текстовой подписью (иконки не пропадают)', () => {
    const h = html(rows[1])
    for (const l of ['Открыть в редакторе (нода №3)', 'К ноде (нода №3)', 'Как в плеере (нода №3)', 'Дублировать (нода №3)', 'Удалить ноду №3']) {
      expect(h).toContain(`aria-label="${l}"`)
    }
    expect((h.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(5 + 1) // 5 иконок действий + «?»
    expect(h).toContain('scTabBtnLabel')
  })

  it('реплики свёрнуты (раскрываются кнопкой), состояние линтера — индикатор с aria-label', () => {
    const h = html(rows[0])
    expect(h).toContain('aria-expanded="false"')
    expect(h).not.toContain('scTabLines')
    expect(h).toMatch(/aria-label="(линтер без замечаний|есть предупреждения|есть ошибки)"/)
  })

  it('нарушение правил S1 — в строке видно «почему» и как исправить', () => {
    const nodes = [sceneNode('a', 1, demoOfficeScene), sceneNode('b', 3, demoOfficeScene)]
    const r = buildSceneRows(nodes, { title: 'try' }).rows[0]
    const h = html(r)
    expect(h).toContain('S1:')
    expect(h).toContain('scTabIssue--err')
    expect(h).toContain('Как исправить')
    expect(h).toContain('scTabRow--err')
  })

  it('пустая нода — «Сцена не выбрана»', () => {
    const empty = { id: 'e', seq: 1, type: 'scene', typeData: { scene: { scene: null } } }
    expect(html(buildSceneRows([empty]).rows[0])).toContain('Сцена не выбрана')
  })
})

describe('подтверждение удаления в строке', () => {
  it('confirming → вопрос с номером ноды, «Да, удалить» и «Отмена» вместо иконок', () => {
    const h = renderToStaticMarkup(<SceneRowActions seq={4} confirming handlers={handlers} onCancel={() => {}} onAsk={() => {}} />)
    expect(h).toContain('Удалить ноду №4?')
    expect(h).toContain('Да, удалить')
    expect(h).toContain('Отмена')
  })
})

describe('сводка и пустое состояние', () => {
  it('сводка: «Сцен в уроке: 4 · динамичных: 1 · статичных: 3»', () => {
    const d = buildSceneRows(fixtureNodes(), { title: 'try' })
    const h = renderToStaticMarkup(<SceneTabSummary summary={d.summary} issues={d.issues} isWordLesson />)
    expect(h).toContain('Сцен в уроке: <b>4</b> · динамичных: <b>1</b> · статичных: <b>3</b>')
    expect(h).toContain('Правила сцен')
  })

  it('нарушения правил: список «Ошибка: …» и «Как исправить»', () => {
    const d = buildSceneRows([sceneNode('a', 1, demoOfficeScene), sceneNode('b', 3, demoOfficeScene)], { title: 'try' })
    const h = renderToStaticMarkup(<SceneTabSummary summary={d.summary} issues={d.issues} isWordLesson />)
    expect(h).toContain('<b>Нода №1. </b>Ошибка: S1:')
    expect(h).toContain('Как исправить: Сделайте первую и последнюю сцену урока кружком Пита')
    expect(h).toContain('scTabRules--err')
  })

  it('пустое состояние: «В уроке нет сцен» и определения динамичной/статичной', () => {
    const h = renderToStaticMarkup(<SceneTabEmpty />)
    expect(h).toContain('В уроке нет сцен')
    expect(h).toContain('Динамичная')
    expect(h).toContain('Статичная')
  })

  it('бейдж шапки: число и тон (ошибки красные, предупреждения жёлтые)', () => {
    expect(sceneTabBadge(buildSceneRows([]).summary)).toEqual({ count: 0, tone: null })
    const bad = buildSceneRows([sceneNode('a', 1, demoOfficeScene), sceneNode('b', 3, demoOfficeScene)], { title: 'try' })
    expect(sceneTabBadge(bad.summary)).toEqual({ count: 2, tone: 'err' })
    const soft = buildSceneRows([sceneNode('a', 1, demoOfficeScene)], {})
    expect(sceneTabBadge(soft.summary).tone).not.toBeNull()
  })
})

describe('блок «Сцена модуля в ленте»', () => {
  const row = { id: 's1', title: 'Сцена ленты', status: 'published', scene: demoOfficeScene }
  it('привязана → название, статус и кнопка «Открыть в редакторе»', () => {
    const h = renderToStaticMarkup(<SceneModuleBlock moduleTitle="Еда" state={{ loaded: true, error: false, sceneId: 's1', row }} onEdit={() => {}} />)
    expect(h).toContain('Сцена ленты')
    expect(h).toContain('опубликована')
    expect(h).toContain('aria-label="Открыть сцену модуля в редакторе"')
  })
  it('не привязана → короткая подсказка; не загружено/ошибка → ничего', () => {
    expect(renderToStaticMarkup(<SceneModuleBlock moduleTitle="Еда" state={{ loaded: true, error: false, sceneId: null, row: null }} onEdit={() => {}} />)).toContain('не привязана')
    expect(renderToStaticMarkup(<SceneModuleBlock moduleTitle="Еда" state={{ loaded: false }} onEdit={() => {}} />)).toBe('')
    expect(renderToStaticMarkup(<SceneModuleBlock moduleTitle="Еда" state={{ loaded: true, error: true }} onEdit={() => {}} />)).toBe('')
  })
  it('sceneBase доступна как чистая функция', () => { expect(sceneBase(null).state).toBe('empty') })
})
