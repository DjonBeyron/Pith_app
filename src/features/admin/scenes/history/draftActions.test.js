import { describe, it, expect } from 'vitest'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'
import * as H from '../draftHistory.js'
import { fromScene, newDraft } from '../builderModel.js'
import { buildDraftActions } from './draftActions.js'
import { initialState, editState, swapState, stepState } from './draftState.js'
import { lineEditLabel } from './historyLabels.js'

// Интеграция истории с правками черновика (то же, что делает useBuilderDraft, но без DOM): настоящие действия
// сборщика поверх переходов draftState; время задаётся вручную (склейка ввода зависит от пауз)

function harness() {
  let now = 0
  let st = initialState(fromScene(demoOfficeScene), { id: 'row-1', status: 'draft', snapshot: null })
  const actions = buildDraftActions((label, fn, key) => { st = editState(st, label, fn, key, now) })
  return {
    actions,
    get st() { return st },
    get scene() { return st.scene },
    at: ms => { now = ms },
    undo: () => { st = stepState(st, H.undo) },
    redo: () => { st = stepState(st, H.redo) },
    swap: (label, next, saved) => { st = swapState(st, label, next, saved, now) },
  }
}

describe('отмена правок черновика', () => {
  it('удалить реплику → отмена возвращает её, повтор удаляет снова; подпись называет реплику', () => {
    const h = harness()
    const before = h.scene
    const n = before.timeline.length
    h.actions.removeLine(2)
    expect(h.scene.timeline).toHaveLength(n - 1)
    expect(H.undoLabel(h.st.hist)).toBe('удаление реплики 3')
    h.undo()
    expect(h.scene).toEqual(before)
    expect(H.redoLabel(h.st.hist)).toBe('удаление реплики 3')
    h.redo()
    expect(h.scene.timeline).toHaveLength(n - 1)
  })

  it('«Удалить все» → отмена возвращает все реплики одним шагом', () => {
    const h = harness()
    const before = h.scene
    h.actions.clearTimeline()
    expect(h.scene.timeline).toEqual([])
    h.undo()
    expect(h.scene.timeline).toEqual(before.timeline)
    expect(H.canUndo(h.st.hist)).toBe(false)
  })

  it('ввод текста одной реплики подряд — один шаг; другое поле — другой шаг', () => {
    const h = harness()
    const original = h.scene.timeline[0].text
    let text = original
    ;[100, 250, 400, 560].forEach(t => { h.at(t); text += 'x'; h.actions.updateLine(0, { text }) })
    expect(h.st.hist.past).toHaveLength(1)
    h.at(600); h.actions.updateLine(1, { text: 'Другая реплика.' })
    expect(h.st.hist.past).toHaveLength(2)
    h.undo()
    h.undo()
    expect(h.scene.timeline[0].text).toBe(original)
  })

  it('добавить/переместить/дублировать реплику, смена локации — отдельные шаги со своими подписями', () => {
    const h = harness()
    h.at(1000); h.actions.addLine()
    h.at(1100); h.actions.moveLine(1, 1)
    h.at(1200); h.actions.duplicateLine(0)
    h.at(1300); h.actions.setLocation('cafe')
    expect(h.st.hist.past.map(s => s.label)).toEqual(['добавление реплики', 'перемещение реплики 2', 'дублирование реплики 1', 'смена локации'])
  })

  it('патч полей озвучки — шаг «озвучка реплики N», не склеивается с вводом', () => {
    expect(lineEditLabel(2, { audioUrl: 'https://x.r2.dev/a.mp3', audioMeta: {} })).toEqual(['озвучка реплики 3', null])
    const h = harness()
    h.at(0); h.actions.updateLine(0, { text: 'Привет.' })
    h.at(100); h.actions.updateLine(0, { audioUrl: 'https://x.r2.dev/a.mp3' })
    expect(h.st.hist.past).toHaveLength(2)
  })

  it('загрузка сцены (из библиотеки) — один шаг, отмена возвращает и сцену, и привязку к строке', () => {
    const h = harness()
    const prev = h.st
    const other = { ...newDraft('office'), title: 'Другая' }
    h.swap('загрузка сцены «Другая»', other, { id: 'row-2', status: 'published', snapshot: other })
    expect(h.st.saved.id).toBe('row-2')
    h.undo()
    expect(h.scene).toEqual(prev.scene)
    expect(h.st.saved.id).toBe('row-1')
    h.redo()
    expect(h.scene.title).toBe('Другая')
    expect(h.st.saved.id).toBe('row-2')
  })

  it('применение JSON (без смены привязки) — шаг; тот же JSON — шага нет', () => {
    const h = harness()
    h.swap('применение JSON', { ...h.scene, title: 'Из JSON' }, null)
    expect(H.undoLabel(h.st.hist)).toBe('применение JSON')
    expect(h.st.saved.id).toBe('row-1')
    const n = h.st.hist.past.length
    h.swap('применение JSON', h.scene, null)
    expect(h.st.hist.past).toHaveLength(n)
  })

  it('правка, не менявшая сцену, шаг не создаёт', () => {
    const h = harness()
    h.actions.removeLine(999)
    expect(H.canUndo(h.st.hist)).toBe(false)
  })

  it('сцена после отмены совпадает с исходной (индикатор «несохранённое» уйдёт)', () => {
    const h = harness()
    const json = JSON.stringify(h.scene)
    h.actions.setTitle('Новое имя')
    h.actions.clearTimeline()
    h.undo(); h.undo()
    expect(JSON.stringify(h.scene)).toBe(json)
  })
})
