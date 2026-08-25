import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { snapPoint, snapMove, SNAP_PX } from './timelineSnap.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// 10с композиции на полосе 1000px: 1px = 0.01с, порог магнита = SNAP_PX * 0.01с
const box = { playhead: 5, duration: 10, stripWidth: 1000 }
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

  it('магнит выключен — время не меняется вообще', () => {
    expect(snapPoint(5.01, { ...box, playhead: null })).toBe(5.01)
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
    expect(snapMove(9 + thr / 2, 1, { ...box, playhead: 10 })).toBeCloseTo(9, 6)
    expect(snapMove(thr / 2, 1, { ...box, playhead: 0 })).toBe(0)
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
    expect(track).toContain('snapMove(free, clipDur, { playhead: snapAt, duration, stripWidth: rect.width })')
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
