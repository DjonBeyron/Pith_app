import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createMiddlePan, MIDDLE } from './useMiddlePan.js'

// Панорама таймлайна зажатой средней кнопкой мыши — чистая логика (без DOM): средняя кнопка начинает, движение двигает прокрутку, отпускание заканчивает; левая кнопка панораму не начинает.
const setup = () => { const x = { scrollLeft: 500 }, y = { scrollTop: 100 }, states = []; let prevented = 0; const pan = createMiddlePan({ scrollers: () => ({ x, y }), onState: s => states.push(s) }); return { x, y, states, pan, ev: (button, cx, cy) => ({ button, clientX: cx, clientY: cy, preventDefault: () => { prevented++ } }), prevented: () => prevented } }

describe('панорама средней кнопкой мыши', () => {
  it('средняя кнопка (button 1) начинает панораму и отключает автопрокрутку браузера (preventDefault)', () => {
    const s = setup()
    expect(MIDDLE).toBe(1); expect(s.pan.down(s.ev(1, 300, 200))).toBe(true)
    expect(s.pan.active()).toBe(true); expect(s.states).toEqual([true]); expect(s.prevented()).toBe(1)
  })
  it('движение сдвигает стол за рукой: по горизонтали — время, по вертикали — высоту; меньше нуля прокрутка не уходит', () => {
    const s = setup()
    s.pan.down(s.ev(1, 300, 200)); s.pan.move(s.ev(1, 180, 230))
    expect(s.x.scrollLeft).toBe(620); expect(s.y.scrollTop).toBe(70)
    s.pan.move(s.ev(1, 1200, 900)); expect(s.x.scrollLeft).toBe(0); expect(s.y.scrollTop).toBe(0)
    s.pan.move(s.ev(1, 300, 200)); expect(s.x.scrollLeft).toBe(500) // сдвиг считается от точки нажатия, а не накапливается
  })
  it('отпускание заканчивает: дальше мышь стол не двигает', () => {
    const s = setup()
    s.pan.down(s.ev(1, 300, 200)); s.pan.move(s.ev(1, 250, 200)); expect(s.pan.up()).toBe(true)
    expect(s.pan.active()).toBe(false); expect(s.states).toEqual([true, false])
    expect(s.pan.move(s.ev(1, 0, 0))).toBe(false); expect(s.x.scrollLeft).toBe(550); expect(s.pan.up()).toBe(false)
  })
  it('левая и правая кнопки панораму не начинают; нет прокручиваемого — тоже', () => {
    const s = setup()
    expect(s.pan.down(s.ev(0, 300, 200))).toBe(false); expect(s.pan.down(s.ev(2, 300, 200))).toBe(false)
    s.pan.move(s.ev(0, 100, 100)); expect(s.x.scrollLeft).toBe(500); expect(s.states).toEqual([]); expect(s.prevented()).toBe(0)
    expect(createMiddlePan({ scrollers: () => ({ x: null, y: null }) }).down(s.ev(1, 0, 0))).toBe(false)
    const only = { scrollLeft: 10 }, p = createMiddlePan({ scrollers: () => ({ x: only, y: null }) })
    p.down({ button: 1, clientX: 50, clientY: 50 }); p.move({ button: 1, clientX: 40, clientY: 0 }); expect(only.scrollLeft).toBe(20)
  })
  it('подключено к столу монтажа (вместе с мини-картой) и к ленте; средний щелчок ничего не открывает; линейка, мини-карта и клип средней кнопкой не управляются', () => {
    const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
    expect(read('./TimelineMontage.jsx')).toContain('useMiddlePan(boxRef, () => scrollRef.current)'); expect(read('../TimelineRibbon.jsx')).toContain('useMiddlePan(ref, () => ref.current)')
    expect(read('./useMiddlePan.js')).toContain("area.addEventListener('auxclick', aux)")
    expect(read('./TimelineMontage.jsx')).toContain("if (e.button > 0 || e.target.closest('.mtgLabel')) return"); expect(read('./MontageMinimap.jsx')).toContain('if (e.button > 0) return'); expect(read('./useClipDrag.js')).toContain('e.button > 0')
    expect(read('../../../styles/timeline-block.css')).toMatch(/\[data-pan='mid'\][^{]*\{ cursor: grabbing/)
  })
})
