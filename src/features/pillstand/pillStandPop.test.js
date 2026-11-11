import { describe, it, expect } from 'vitest'
import { popMoments, popLine, bubbleStats, topGaps, bubbleLine, POP_FULL } from './pillStandPop.js'
import { snapPillEl, applySnap } from './pillStandSnap.js'
import { flagsOf, stateSig, flagStarts } from './pillStandFrames.js'
import { createDoc, fakePill } from './pillStandFakeDom.js'

// Отчёт «Анимация» стенда пилюль: «хлопок при заливке 1,00, через 96 мс после зачёта» — по кадрам записи, без записи — по трассе
const fr = (i, t, v, { scale = 'none', fl = 0, bub = 0, out = false, full = v >= 0.999 } = {}) => ({ t, i, g: 1, v, s: { a: { 'data-lock': '1', ...(full ? { 'data-full': '1' } : {}) }, fx: { scale, tf: 'none', op: '1', ol: 'none' }, fl: Array.from({ length: fl }, () => ({})), ink: '', bb: bub ? { tf: '', out, n: Array.from({ length: bub }, () => ({})) } : null, mask: [] } })

describe('стенд пилюль: момент хлопка', () => {
  it('по кадрам: заливка на экране в первом кадре хлопка / вспышки и мс от зачёта (pill claim)', () => {
    const frames = [fr(0, 1000, 0.4, { bub: 3 }), fr(1, 1017, 0.52, { bub: 4 }), fr(2, 1033, 0.7, { bub: 6 }), fr(3, 1050, 0.86, { bub: 8 }), fr(4, 1067, 0.95, { bub: 8 }), fr(5, 1083, 0.99, { bub: 8 }), fr(6, 1100, 1, { scale: '1.004', fl: 2, bub: 8, out: true }), fr(7, 1117, 1, { scale: '1.02', fl: 2, bub: 8, out: true })]
    const events = [{ t: 1000.4, k: 'pill', type: 'claim' }, { t: 1100.2, k: 'pill', type: 'snap' }, { t: 1100.3, k: 'pill', type: 'win' }]
    const pops = popMoments(frames, events)
    expect(pops).toEqual([{ t: 1100, v: 1, ms: 100, frame: 7, src: 'кадр' }])
    expect(popLine(pops)).toBe('хлопок при заливке 1,00, через 100 мс после зачёта (кадр 7)')
    const b = bubbleStats(frames, pops)
    expect(b).toEqual({ max: 8, frames: 6, first: 1000, out: 2, outMax: 8, early: 0, atPop: [{ t: 1100, n: 8 }] }) // до хлопка пузыри только внутри; в кадре хлопка все восемь — снаружи
    expect(topGaps(frames, pops)).toEqual([])
    expect(bubbleLine(b, [])).toBe('пузыри в жидкости: до 8 за кадр, в 6 кадрах · в кадре хлопка вырвались 8 · зазор сверху: нет')
  })
  it('запись снимает кадр до шага движка — щелчок виден кадром позже: мс от зачёта считаются по событию щелчка, заливка — по кадру', () => {
    const frames = [fr(0, 1083, 0.99), fr(1, 1100, 1), fr(2, 1117, 1, { fl: 2 }), fr(3, 1133, 1, { scale: '1.003', fl: 2 })]
    const pops = popMoments(frames, [{ t: 1000.4, k: 'pill', type: 'claim' }, { t: 1100.6, k: 'pill', type: 'snap' }])
    expect(pops).toEqual([{ t: 1117, v: 1, ms: 100, frame: 3, src: 'кадр' }])
  })
  it('старый порядок (хлопок раньше доезда) виден сразу: заливка 0,51 — пометка', () => {
    const frames = [fr(0, 2000, 0.4), fr(1, 2017, 0.51, { scale: '1.01', fl: 2 }), fr(2, 2034, 0.6, { scale: '1.03', fl: 2 }), fr(3, 2250, 1, { scale: '1.05' })]
    const pops = popMoments(frames, [{ t: 2000, k: 'pill', type: 'claim' }])
    expect(pops).toHaveLength(1)                                           // один хлопок — один старт
    expect(pops[0].v).toBeLessThan(POP_FULL)
    expect(popLine(pops)).toBe('хлопок при заливке 0,51 ⚠ РАНЬШЕ ДОЕЗДА, через 17 мс после зачёта (кадр 2)')
  })
  it('без записи — по трассе: событие snap (у фразы — win) и кадр заливки рядом; фраза — от onPhrase с ratio ≥ 0,75', () => {
    const word = [{ t: 500, k: 'pill', type: 'claim' }, { t: 583, k: 'fill', goal: 1, shown: 0.93 }, { t: 600.1, k: 'pill', type: 'snap' }, { t: 600.2, k: 'pill', type: 'win' }, { t: 600.4, k: 'fill', goal: 1, shown: 1 }]
    expect(popMoments([], word)).toEqual([{ t: 600.1, v: 1, ms: 100, frame: null, src: 'трасса' }])
    expect(popLine(popMoments([], word))).toBe('хлопок при заливке 1,00, через 100 мс после зачёта (по трассе)')
    const phrase = [{ t: 900, k: 'phrase', ratio: 0.5 }, { t: 1000, k: 'phrase', ratio: 1 }, { t: 1099.8, k: 'fill', goal: 1, shown: 1 }, { t: 1100, k: 'pill', type: 'win' }]
    expect(popMoments([], phrase)[0]).toMatchObject({ v: 1, ms: 100 })
  })
  it('хлопка не было; зачёта в отрезке нет', () => {
    expect(popLine(popMoments([fr(0, 0, 0.2)], []))).toBe('хлопок: не было')
    expect(popLine(popMoments([fr(0, 10, 1, { fl: 1 })], []))).toBe('хлопок при заливке 1,00, зачёта в отрезке нет (кадр 1)')
    expect(bubbleStats([fr(0, 0, 0.2)])).toEqual({ max: 0, frames: 0, first: null, out: 0, outMax: 0, early: 0, atPop: [] })
    expect(bubbleLine(bubbleStats([fr(0, 0, 0.2)]), [])).toBe('пузыри в жидкости: не было · наружу не вылетали · зазор сверху: нет')
  })
  it('пузыри снаружи ДО хлопка и «зазор сверху» (заливка не 100 % или пилюля не помечена полной после хлопка) — пометки ⚠', () => {
    const early = [fr(0, 1000, 0.6, { bub: 5 }), fr(1, 1017, 0.7, { bub: 5, out: true }), fr(2, 1100, 1, { scale: '1.01', fl: 2, bub: 5, out: true })]
    const pops = popMoments(early, [{ t: 1000, k: 'pill', type: 'claim' }, { t: 1100, k: 'pill', type: 'snap' }])
    expect(bubbleStats(early, pops).early).toBe(1)
    expect(bubbleLine(bubbleStats(early, pops), [])).toContain('⚠ НАРУЖУ ДО ХЛОПКА: 1 кадров')
    const gap = [fr(0, 1083, 0.99), fr(1, 1100, 0.97, { scale: '1.01', fl: 2 }), fr(2, 1117, 0.97, { scale: '1.03', fl: 2 })]
    const gp = popMoments(gap, [{ t: 1000, k: 'pill', type: 'claim' }, { t: 1100, k: 'pill', type: 'snap' }])
    expect(topGaps(gap, gp)).toEqual([{ t: 1100, frame: 2, v: 0.97 }])
    expect(bubbleLine(bubbleStats(gap, gp), topGaps(gap, gp))).toContain('зазор сверху: ⚠ кадр 2 заливка 0,97')
    const noFull = [fr(0, 1100, 1, { scale: '1.01', fl: 2, full: false })]                 // заливка 1,00, но признака полной пилюли нет — тоже зазор
    expect(topGaps(noFull, popMoments(noFull, []))).toHaveLength(1)
  })
})

describe('стенд пилюль: пузыри в записи', () => {
  const document = createDoc()
  const cs = el => ({ scale: 'none', transform: el.style.transform || 'none', opacity: el.style.opacity || '1', outline: 'none' })
  const bubs = (pill, list, out = false) => {
    const box = document.createElement('span'); box.className = 'wlBubs'; box.style.transform = 'translateY(30.0%)'; if (out) box.setAttribute('data-out', '1')
    for (const [left, tf, op, off] of list) { const n = document.createElement('span'); n.className = 'wlBub'; n.style.cssText = `left:calc(50% + ${left}px);top:24.0px;width:4.2px;height:4.2px`; n.style.transform = tf; n.style.opacity = op; if (off) n.setAttribute('data-off', '1'); box.appendChild(n) }
    pill.querySelector('.wlPillSparks').appendChild(box)
  }
  it('снимок: набор пузырей — отдельно от вспышек (bb): transform набора, «вылетели», у каждого ВИДИМОГО пузыря место и миг; плеер ставит их на те же места классами игры', () => {
    const a = fakePill(document)
    bubs(a, [[10, 'matrix(1, 0, 0, 1, 2, -4)', '0.8'], [-12, 'matrix(1, 0, 0, 1, -3, 3)', '1'], [4, 'none', '1', true]])
    a.querySelector('.wlPillInkIn').style.transform = 'translateY(-30.0%)'; a.querySelector('.wlPillSparks b').style.transform = 'scaleX(0.8)'; a.querySelector('.wlPillSparks b').style.opacity = '1'
    a.setAttribute('data-cap', 'кот')
    const fl = document.createElement('i'); fl.style.cssText = 'position:absolute;inset:-4px;border:3px solid #4fb3ee'; a.appendChild(fl)
    const s = snapPillEl(a, cs)
    expect(s.fl).toHaveLength(1)                                           // кольцо вспышки — вспышка, пузыри в неё не попали
    expect(s.bb).toMatchObject({ tf: 'translateY(30.0%)', out: false })
    expect(s.bb.n).toHaveLength(2)                                         // выключенный (data-off) пузырь в кадр не идёт
    expect(s.bb.n[0]).toMatchObject({ op: '0.8', tf: 'matrix(1, 0, 0, 1, 2, -4)' })
    expect(s.bb.n[0].css).toContain('left:calc(50% + 10px)')
    expect(s.ink).toBe('translateY(-30.0%)'); expect(s.ln).toEqual({ tf: 'scaleX(0.8)', op: '1' })
    const b = fakePill(document)
    applySnap(b, s)
    const box = b.querySelector('.wlPillSparks .wlBubs')
    expect(box.className).toBe('psFlash wlBubs'); expect(box.style.transform).toBe('translateY(30.0%)'); expect(box.hasAttribute('data-out')).toBe(false)
    expect(box.children.map(n => [n.className, n.style.left, n.style.opacity, n.style.transform])).toEqual([['wlBub', 'calc(50% + 10px)', '0.8', 'matrix(1, 0, 0, 1, 2, -4)'], ['wlBub', 'calc(50% + -12px)', '1', 'matrix(1, 0, 0, 1, -3, 3)']])
    expect(b.querySelector('.wlPillInkIn').style.transform).toBe('translateY(-30.0%)')
    expect(b.querySelector('.wlPillInkIn').getAttribute('data-cap')).toBe('кот')       // тёмная подпись поверх жидкости — та же
    expect(b.querySelector('.wlPillSparks b').style.transform).toBe('scaleX(0.8)')
    expect(snapPillEl(b, cs).bb).toBeNull()                                            // пузыри плеера — накладки кадра, в новый снимок не идут
    applySnap(b, { ...s, bb: { ...s.bb, out: true } }); expect(b.querySelector('.wlBubs').hasAttribute('data-out')).toBe(true); expect(b.querySelectorAll('.wlBubs')).toHaveLength(1)
    applySnap(b, { ...s, bb: null }); expect(b.querySelectorAll('.wlBubs')).toHaveLength(0) // следующий кадр — пузырей нет
    applySnap(b, { ...s, bb: undefined, ink: undefined, ln: undefined }); expect(b.querySelectorAll('.psFlash')).toHaveLength(1) // старая запись без этих полей
  })
  it('флаги кадра: «пузыри×N» (в жидкости) и «вылет×N» (снаружи); подпись состояния — есть / вылетели / нет (число пузырей кадры таблицы не плодит); первые кадры флагов', () => {
    const f = (n, out) => fr(0, 0, 0.5, { bub: n, out })
    expect(flagsOf(f(3))).toContain('пузыри×3')
    expect(flagsOf(f(8, true))).toContain('вылет×8')
    expect(flagsOf(f(0)).some(x => /пузыри|вылет/.test(x))).toBe(false)
    expect(stateSig(f(3))).toBe(stateSig(f(5)))
    expect(stateSig(f(3))).not.toBe(stateSig(f(0)))
    expect(stateSig(f(3))).not.toBe(stateSig(f(3, true)))
    expect(flagStarts([fr(0, 10, 0.4), fr(1, 27, 0.5, { bub: 1 }), fr(2, 43, 0.6, { bub: 3 }), fr(3, 60, 1, { bub: 3, out: true })]).filter(x => x.flag === 'пузыри' || x.flag === 'вылет')).toEqual([{ t: 27, i: 1, flag: 'пузыри' }, { t: 60, i: 3, flag: 'вылет' }])
  })
})
