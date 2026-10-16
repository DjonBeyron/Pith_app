import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { demoTemplateScene, demoOfficeScene } from '../../scene/v2/demoScenes.js'
import { lintScene } from '../../scene/v2/sceneLint.js'
import { fillSceneVars } from '../../scene/v2/sceneVars.js'
import * as H from './draftHistory.js'
import { fromScene } from './builderModel.js'
import { buildDraftActions } from './history/draftActions.js'
import { initialState, editState, stepState } from './history/draftState.js'
import { addVar, removeVar, renameVarAt, updateVar, insertPlaceholder, insertVarInLine, cleanVarName } from './varsOps.js'
import VarsPanel from './VarsPanel.jsx'
import InsertVarSelect from './InsertVarSelect.jsx'
import TrialWords from './TrialWords.jsx'
import { PanelCtx } from './ui/panelContext.js'
import { templateList } from './ui/sceneTemplates.js'

const base = () => fromScene(demoTemplateScene)

function harness(scene = base()) {
  let st = initialState(scene, { id: null, status: 'draft', snapshot: null })
  let now = 0
  const actions = buildDraftActions((label, fn, key) => { st = editState(st, label, fn, key, now) })
  return { actions, get scene() { return st.scene }, get st() { return st }, at: ms => { now = ms }, undo: () => { st = stepState(st, H.undo) }, redo: () => { st = stepState(st, H.redo) } }
}

describe('varsOps — чистые правки', () => {
  it('addVar: свободное имя, не больше трёх', () => {
    let s = addVar(base())
    expect(Object.keys(s.vars)).toEqual(['food', 'word'])
    s = addVar(s)
    expect(Object.keys(s.vars)).toEqual(['food', 'word', 'word2'])
    expect(addVar(s)).toBe(s)
    expect(addVar(fromScene(demoOfficeScene)).vars.word.pick).toBe('weak')
  })
  it('renameVarAt переписывает {name}, {name:ru} и segments; занятое/пустое имя — без изменений', () => {
    const s0 = base()
    s0.timeline[0] = { ...s0.timeline[0], segments: [{ var: 'food' }] }
    const s = renameVarAt(s0, 0, 'dish')
    expect(Object.keys(s.vars)).toEqual(['dish'])
    expect(s.timeline[0].text).toBe('Can I have {dish}, please?')
    expect(s.timeline[0].translation).toContain('{dish:ru}')
    expect(s.timeline[0].segments).toEqual([{ var: 'dish' }])
    expect(lintScene(s).filter(x => x.level === 'error')).toEqual([])
    expect(renameVarAt(addVar(base()), 0, 'word')).toEqual(addVar(base()))
    expect(renameVarAt(base(), 0, '')).toEqual(base())
    expect(cleanVarName('до мой-name 1!')).toBe('name1')
  })
  it('updateVar: pick, слово (≤ 40), перевод (пустой убирается)', () => {
    let s = updateVar(base(), 'food', { pick: 'known' })
    expect(s.vars.food.pick).toBe('known')
    expect(updateVar(s, 'food', { pick: 'bad' }).vars.food.pick).toBe('known')
    s = updateVar(s, 'food', { text: 'x'.repeat(60) })
    expect(s.vars.food.fallback.text).toHaveLength(40)
    s = updateVar(s, 'food', { translation: '' })
    expect('translation' in s.vars.food.fallback).toBe(false)
    expect(updateVar(s, 'nope', { text: 'a' })).toBe(s)
  })
  it('removeVar: плейсхолдеры заменяются запасным словом; последняя переменная убирает vars и разэкранирует {{ }}', () => {
    const s0 = base()
    s0.timeline[1] = { ...s0.timeline[1], text: 'Use {{x}} {food}.' }
    const s = removeVar(s0, 'food')
    expect(s.vars).toBeUndefined()
    expect(s.timeline[0].text).toBe('Can I have a sandwich, please?')
    expect(s.timeline[0].translation).toBe('Можно мне бутерброд, пожалуйста?')
    expect(s.timeline[1].text).toBe('Use {x} a sandwich.')
    const two = removeVar(addVar(base()), 'word')
    expect(Object.keys(two.vars)).toEqual(['food'])
    expect(removeVar(base(), 'zzz')).toEqual(base())
  })
  it('insertPlaceholder: позиция курсора, {name:ru} в переводе, лимит 140', () => {
    expect(insertPlaceholder('Have , please', 'food', 'text', 5, 5)).toEqual({ text: 'Have {food}, please', caret: 11 })
    expect(insertPlaceholder('abc', 'food', 'translation', 0, 3).text).toBe('{food:ru}')
    expect(insertPlaceholder('abc', 'food', 'text').text).toBe('abc{food}') // без выделения — в конец
    const long = 'x'.repeat(138)
    expect(insertPlaceholder(long, 'food', 'text', 1, 1).text).toBe(long)
    const s = insertVarInLine(base(), 0, 'text', 'food', 0, 0)
    expect(s.timeline[0].text.startsWith('{food}Can')).toBe(true)
    expect(insertVarInLine(base(), 0, 'text', 'nope', 0, 0)).toEqual(base())
  })
})

describe('действия сборщика: отмена и повтор', () => {
  it('addVar → отмена → повтор; подпись шага', () => {
    const h = harness()
    h.actions.addVar()
    expect(Object.keys(h.scene.vars)).toHaveLength(2)
    expect(H.undoLabel(h.st.hist)).toBe('добавление переменной')
    h.undo()
    expect(Object.keys(h.scene.vars)).toEqual(['food'])
    h.redo()
    expect(Object.keys(h.scene.vars)).toHaveLength(2)
  })
  it('ввод запасного слова склеивается в один шаг, отмена возвращает прежнее', () => {
    const h = harness()
    h.at(1000); h.actions.updateVar('food', { text: 'c' })
    h.at(1100); h.actions.updateVar('food', { text: 'ch' })
    h.at(1200); h.actions.updateVar('food', { text: 'che' })
    expect(H.undoLabel(h.st.hist)).toBe('запасное слово food')
    h.undo()
    expect(h.scene.vars.food.fallback.text).toBe('a sandwich')
    expect(H.canUndo(h.st.hist)).toBe(false)
  })
  it('смена типа отбора и перевод — отдельные шаги; вставка и удаление отменяются', () => {
    const h = harness()
    h.actions.updateVar('food', { pick: 'due' })
    h.actions.insertVar(0, 'text', 'food', 0, 0)
    expect(h.scene.timeline[0].text.startsWith('{food}')).toBe(true)
    expect(H.undoLabel(h.st.hist)).toBe('вставка переменной в реплику 1')
    h.undo()
    expect(h.scene.timeline[0].text.startsWith('Can')).toBe(true)
    h.undo()
    expect(h.scene.vars.food.pick).toBe('weak')
    h.actions.removeVar('food')
    expect(h.scene.vars).toBeUndefined()
    h.undo()
    expect(h.scene.vars.food.fallback.text).toBe('a sandwich')
    expect(h.scene.timeline[0].text).toBe('Can I have {food}, please?')
  })
  it('переименование: ввод имени склеивается', () => {
    const h = harness()
    h.at(0); h.actions.renameVar(0, 'd')
    h.at(100); h.actions.renameVar(0, 'di')
    expect(Object.keys(h.scene.vars)).toEqual(['di'])
    h.undo()
    expect(Object.keys(h.scene.vars)).toEqual(['food'])
  })
})

describe('разметка блоков шаблона', () => {
  const wrap = el => renderToStaticMarkup(<PanelCtx.Provider value={null}>{el}</PanelCtx.Provider>)
  it('VarsPanel: поля переменной, подписи типов отбора, «Добавить»', () => {
    const html = wrap(<VarsPanel scene={base()} actions={{}} />)
    expect(html).toContain('Слова-переменные')
    for (const w of ['шатающиеся', 'на повтор', 'знакомые', 'Запасное слово', 'Его перевод']) expect(html).toContain(w)
    expect(html).toContain('id="f-vars-food-fallback-text"')
    expect(html).toContain('1 / 3')
  })
  it('VarsPanel без переменных — подсказка; на трёх «Добавить» заблокирована', () => {
    expect(wrap(<VarsPanel scene={fromScene(demoOfficeScene)} actions={{}} />)).toContain('Переменных нет')
    const three = addVar(addVar(base()))
    expect(wrap(<VarsPanel scene={three} actions={{}} />)).toMatch(/<button[^>]*disabled=""[^>]*>Добавить/)
  })
  it('InsertVarSelect: список {name} / {name:ru}; без переменных — пусто', () => {
    const ref = { current: null }
    expect(renderToStaticMarkup(<InsertVarSelect scene={base()} index={0} field="text" inputRef={ref} actions={{}} />)).toContain('{food}</option>')
    expect(renderToStaticMarkup(<InsertVarSelect scene={base()} index={0} field="translation" inputRef={ref} actions={{}} />)).toContain('{food:ru}</option>')
    expect(renderToStaticMarkup(<InsertVarSelect scene={fromScene(demoOfficeScene)} index={0} field="text" inputRef={ref} actions={{}} />)).toBe('')
  })
  it('TrialWords: поля слов только когда включено; пробные слова меняют предпросмотр, не сцену', () => {
    const trial = { on: true, setOn() {}, setWord() {}, values: { food: { text: 'cheese', translation: 'сыр' } } }
    const html = renderToStaticMarkup(<TrialWords scene={base()} trial={trial} />)
    expect(html).toContain('value="cheese"')
    expect(html).toContain('в сцену не сохраняется')
    expect(renderToStaticMarkup(<TrialWords scene={base()} trial={{ ...trial, on: false }} />)).not.toContain('value="cheese"')
    const scene = base()
    expect(fillSceneVars(scene, trial.values).timeline[0].text).toBe('Can I have cheese, please?')
    expect(scene.timeline[0].text).toBe('Can I have {food}, please?')
  })
  it('шаблон есть в списке шаблонов сборщика с пометкой «со словами»', () => {
    const t = templateList().find(x => x.id === 'demo-template-food')
    expect(t.note).toContain('со словами')
  })
})
