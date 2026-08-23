import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const model  = read('./useTableTimelineEdit.js')
const track  = read('./TableTimelineTrack.jsx')
const editor = read('./TableTimelineEditor.jsx')
const raf    = read('../../player/panels/table-dictator/useTableDictatorRaf.js')

describe('одна кнопка на клип вместо россыпи иконок', () => {
  it('на клипе кнопка ▾, она открывает меню', () => {
    expect(track).toContain('className={`tlClipMenuBtn')
    expect(track).toContain('setMenuRect(e.currentTarget.getBoundingClientRect())')
    expect(track).toContain('<ClipMenu')
  })

  it('в меню три пункта: сборка, дублировать, очистить', () => {
    const menu = read('./ClipMenu.jsx')
    expect(menu).toContain('Идёт в сборку фразы')
    expect(menu).toContain('Дублировать клип')
    expect(menu).toContain('Очистить собранное')
  })

  it('у «Проверить» и «Очистить» пункта про сборку нет — им нечего собирать', () => {
    expect(track).toContain('canCollect={!layer.isCheck && !layer.isClear}')
  })

  it('плейхед не перехватывает клики по кнопкам клипов', () => {
    // линия растянута на всю высоту дорожек: если она ловит мышь, кнопка
    // меню под ней не нажимается
    const css = read('../../../styles/canvas/table-editor-timeline.css')
    const line = css.slice(css.indexOf('.tlCursorLine {'), css.indexOf('.tlCursorGrab {'))
    expect(line).toContain('pointer-events: none')
    const grab = css.slice(css.indexOf('.tlCursorGrab {'))
    expect(grab).toContain('height: 26px')
    expect(grab).toContain('pointer-events: auto')
  })
})

describe('повтор клипа', () => {
  it('встаёт следом за последним и не вылезает за композицию', () => {
    const fn = model.slice(model.indexOf('const duplicateClip'), model.indexOf('const addClearClip'))
    expect(fn).toContain('const lastEnd = Math.max(...all.map(c => c.end))')
    expect(fn).toContain('Math.min(lastEnd + 0.2, Math.max(0, (timelineDur ?? lastEnd + len) - len))')
    expect(fn).toContain('repeats: [...(l.repeats ?? []), { start, end: start + len }]')
  })

  it('в плеере повтор отыгрывает своим чередом, а не считается сыгравшим', () => {
    expect(raf).toContain('const shots = [layer.clips?.[0], ...(layer.repeats ?? [])].filter(Boolean)')
    expect(raf).toContain('const key = `cell-${layer.cellId}#${idx}`')
  })
})

describe('очистка собранной фразы', () => {
  it('есть и отдельной дорожкой, и клипом на дорожке слоя', () => {
    expect(model).toContain('const addClearLayer')
    expect(model).toContain('isClear: true')
    expect(model).toContain('const addClearClip')
    expect(editor).toContain('+ Очистить')
  })

  it('в плеере срабатывает по началу клипа и ровно один раз', () => {
    const block = raf.slice(raf.indexOf('// Очистка собранного'))
    expect(block).toContain('if (t < c.start || t >= c.end) return')
    expect(block).toContain('if (clearedRef.current.has(key)) return')
    expect(block).toContain('clearedRef.current.add(key)')
  })

  it('после очистки те же ячейки и слова могут упасть в бокс заново', () => {
    const block = raf.slice(raf.indexOf('// Очистка собранного'))
    expect(block).toContain('assembledRef.current = []')
    expect(block).toContain('addedCellsRef.current = new Set()')
    expect(block).toContain('greenedKeys.clear()')
  })

  it('счётчик сработавших очисток сбрасывается на старте прогона', () => {
    const panel = read('../../player/panels/table-dictator/TableDictatorPanel.jsx')
    expect(panel).toContain('clearedRef.current    = new Set()')
  })

  it('всё это сохраняется вместе со слоем', () => {
    expect(model).toContain('isClear, visible, highlightOn, collect, pick, clips, repeats, clears }')
  })
})
