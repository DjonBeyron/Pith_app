import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { snapPoint, snapMove, SNAP_PX } from './timelineSnap.js'
import { collectSnapEdges } from './timelineSnapEdges.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// 10с композиции на полосе 1000px: 1px = 0.01с, порог магнита = SNAP_PX * 0.01с
const box = { targets: [5], duration: 10, stripWidth: 1000 }
const thr = SNAP_PX / 100

describe('магнит к плейхеду', () => {
  it('край почти у флажка — прилипает', () => {
    expect(snapPoint(5 + thr / 2, box)).toBe(5)
    expect(snapPoint(5 - thr / 2, box)).toBe(5)
  })

  it('край далеко — не трогаем (магнит не должен быть навязчивым)', () => {
    const far = 5 + thr * 3
    expect(snapPoint(far, box)).toBe(far)
  })

  it('магнит выключен (целей нет) — время не меняется вообще', () => {
    expect(snapPoint(5.01, { ...box, targets: [] })).toBe(5.01)
  })

  it('при перетаскивании липнет ближний край: начало', () => {
    expect(snapMove(5 + thr / 2, 1, box)).toBe(5)
  })

  it('при перетаскивании липнет ближний край: конец', () => {
    // конец клипа (start + 1) почти на флажке → start уезжает на playhead - 1
    expect(snapMove(4 + thr / 2, 1, box)).toBeCloseTo(4, 6)
  })

  it('клип не выталкивается за границы композиции', () => {
    // флажок в самом конце: клип целиком остаётся внутри композиции
    expect(snapMove(9 + thr / 2, 1, { ...box, targets: [10] })).toBeCloseTo(9, 6)
    expect(snapMove(thr / 2, 1, { ...box, targets: [0] })).toBe(0)
  })

  it('оба края далеко — клип стоит там, куда его тянут', () => {
    expect(snapMove(1, 1, box)).toBe(1)
  })
})

describe('магнит и протяжки в интерфейсе таймлайна', () => {
  it('кнопка 🧲 стоит над колонкой названий дорожек', () => {
    const ruler = read('./TableTimelineRuler.jsx')
    expect(ruler).toContain('tlRulerCorner')
    expect(ruler).toContain('className={`tlSnapBtn${snapOn ? \' tlSnapBtnOn\' : \'\'}`}')
    expect(read('./TableTimelineEditor.jsx')).toContain('snapAt={snapOn ? currentTime : null}')
  })

  it('клип и его ручки спрашивают магнит', () => {
    const track = read('./TableTimelineTrack.jsx')
    expect(track).toContain('const t = snap(getTime(mv))')
    expect(track).toContain('snapMove(free, clipDur, { targets: snapTargets(), duration, stripWidth: rect.width })')
  })

  it('протяжка закрывается не только по mouseup — клип не залипает', () => {
    const drag = read('./timelineDrag.js')
    for (const ev of ['mouseup', 'pointerup', 'pointercancel', 'dragend', 'blur']) {
      expect(drag).toContain(`window.addEventListener('${ev}'`)
      expect(drag).toContain(`window.removeEventListener('${ev}'`)
    }
    // все протяжки таймлайна идут через общую сессию
    for (const f of ['./TableTimelineTrack.jsx', './TableTimelineRuler.jsx', './TableTimelineEditor.jsx']) {
      expect(read(f)).toContain('startDragSession(')
      expect(read(f)).not.toContain("window.addEventListener('mousemove'")
    }
  })

  it('на странице таймлайна текст не выделяется, кроме полей ввода', () => {
    const css = read('../../../styles/canvas/table-editor-timeline.css')
    const block = css.slice(css.indexOf('.tlEditor {'), css.indexOf('.tlRulerCorner'))
    expect(block).toContain('user-select: none')
    expect(css).toContain('.tlEditor input, .tlEditor textarea, .tlEditor select {')
  })
})

describe('магнит к краям клипов на других дорожках', () => {
  const layers = [
    { id: 'l1', clips: [{ start: 1, end: 2 }, { start: 0, end: 8 }], repeats: [{ start: 4, end: 5 }] },
    { id: 'l2', clips: [{ start: 3, end: 3.5 }], clears: [{ start: 6, end: 6.5 }] },
  ]

  it('в цели идут все клипы слоя: подсветка, проявление, повторы, очистки', () => {
    const edges = collectSnapEdges(layers)
    expect(edges.filter(e => e.layerId === 'l1').map(e => e.t)).toEqual([1, 2, 0, 8, 4, 5])
    expect(edges.filter(e => e.layerId === 'l2').map(e => e.t)).toEqual([3, 3.5, 6, 6.5])
  })

  it('край клипа прилипает к краю соседнего слоя', () => {
    const targets = collectSnapEdges(layers).filter(e => e.layerId !== 'l1').map(e => e.t)
    expect(snapPoint(3 + thr / 2, { targets, duration: 10, stripWidth: 1000 })).toBe(3)
  })

  it('при равном расстоянии побеждает плейхед — он в списке первый', () => {
    const targets = [5, 5 + thr]
    expect(snapPoint(5 + thr / 2, { targets, duration: 10, stripWidth: 1000 })).toBe(5)
  })

  it('перетаскивание тоже липнет к соседям — тем краем, что ближе', () => {
    const targets = [3]
    // конец клипа почти на 3 → начало уезжает на 3 - длина
    expect(snapMove(2 + thr / 2, 1, { targets, duration: 10, stripWidth: 1000 })).toBeCloseTo(2, 6)
  })

  it('дорожка не липнет к собственным клипам (иначе клип не сдвинуть)', () => {
    const track = readFileSync(fileURLToPath(new URL('./TableTimelineTrack.jsx', import.meta.url)), 'utf8')
    expect(track).toContain('snapEdges.filter(e => e.layerId !== layer.id)')
  })

  it('выделение текста на странице таймлайна рубится на selectstart', () => {
    const hook = readFileSync(fileURLToPath(new URL('./useNoTextSelection.js', import.meta.url)), 'utf8')
    expect(hook).toContain("addEventListener('selectstart'")
    expect(hook).toContain("tag === 'INPUT'")
    const editor = readFileSync(fileURLToPath(new URL('./TableTimelineEditor.jsx', import.meta.url)), 'utf8')
    expect(editor).toContain('useNoTextSelection(rootRef)')
  })
})
