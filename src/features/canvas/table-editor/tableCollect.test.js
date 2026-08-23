import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Галочка на зелёном клипе: идёт ли значение в собираемую фразу. Снятая
// оставляет подсветку и анимацию, но слово/ячейка в бокс не падает.
describe('галочка «идёт в сборку»', () => {
  const model  = read('./useTableTimelineEdit.js')
  const track  = read('./TableTimelineTrack.jsx')
  const editor = read('./TableTimelineEditor.jsx')

  it('у новых слоёв включена по умолчанию — и у ячеек, и у слов', () => {
    expect(model).toContain('visible: true, highlightOn: true, collect: true')
    expect(model).toContain('id: uid(), word, visible: true, collect: true')
  })

  it('старые таймлайны без поля читаются как «включено»', () => {
    expect(model).toContain('collect: l.collect !== false')
  })

  it('переключается и сохраняется вместе со слоем', () => {
    expect(model).toContain('const toggleCollect = useCallback')
    expect(model).toContain('collect: !(l.collect !== false)')
    expect(model).toContain('visible, highlightOn, collect, pick, clips, repeats, clears }')
  })

  it('переключается из меню клипа, кроме «Проверить» и «Очистить»', () => {
    expect(track).toContain('canCollect={!layer.isCheck && !layer.isClear}')
    expect(track).toContain('onToggleCollect={onToggleCollect}')
    expect(editor).toContain('onToggleCollect={() => toggleCollect(layer.id)}')
  })
})

describe('общая галочка в шапке таймлайна', () => {
  const model  = read('./useTableTimelineEdit.js')
  const editor = read('./TableTimelineEditor.jsx')

  it('переключает сборку у всех слоёв разом, «Проверить» не трогает', () => {
    const fn = model.slice(model.indexOf('const setAllCollect'))
    expect(fn).toContain('prev.map(l => (l.isCheck ? l : { ...l, collect: value }))')
  })

  it('показывает три состояния: все, часть, никто', () => {
    expect(editor).toContain("const allCollect  = collectable.length > 0 && collectable.every(l => l.collect !== false)")
    expect(editor).toContain('const someCollect = collectable.some(l => l.collect !== false)')
    expect(editor).toContain("allCollect ? ' tlAllCollectOn' : someCollect ? ' tlAllCollectSome' : ''")
  })

  it('клик по включённой выключает всех, иначе включает', () => {
    expect(editor).toContain('onClick={() => setAllCollect(!allCollect)}')
  })

  it('слоёв нет — кнопка недоступна', () => {
    expect(editor).toContain('disabled={!collectable.length}')
  })

  it('стили шапки таймлайна вынесены отдельным файлом (потолок размера)', () => {
    const controls = read('../../../styles/canvas/table-editor-controls.css')
    expect(controls).toContain('.tlAllCollect')
    expect(controls).toContain('.tlLenField')
    expect(read('../../../index.css')).toContain('table-editor-controls.css')
  })
})

describe('плеер уважает галочку', () => {
  const raf  = read('../../player/panels/table-dictator/useTableDictatorRaf.js')
  const post = read('../../player/panels/table-dictator/dictatorPostAudio.js')

  it('ячейка со снятой галочкой горит, но в бокс не идёт', () => {
    expect(raf).toContain('if (val && layer.collect === false) {')
    expect(raf).toContain('glowOn(key, `ЯЧЕЙКА "${val}"`, hlClip.end - hlClip.start)')
    expect(post).toContain('if (layer.collect === false) {')
  })

  it('слово со снятой галочкой тоже только подсвечивается', () => {
    expect(raf).toContain('if (collect === false) {')
    expect(raf).toContain('fresh.push({ k, word: l.word, collect: l.collect })')
  })

  it('проверка не ждёт то, что в сборку не идёт', () => {
    expect(post).toContain('if (l.collect === false) continue')
  })
})
