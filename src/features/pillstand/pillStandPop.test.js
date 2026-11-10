import { describe, it, expect } from 'vitest'
import { popMoments, popLine, jetStats, POP_FULL } from './pillStandPop.js'
import { snapPillEl, applySnap } from './pillStandSnap.js'
import { flagsOf, stateSig, flagStarts } from './pillStandFrames.js'
import { createDoc, fakePill } from './pillStandFakeDom.js'

// Отчёт «Анимация» стенда пилюль: «хлопок при заливке 1,00, через 96 мс после зачёта» — по кадрам записи, без записи — по трассе
const fr = (i, t, v, { scale = 'none', fl = 0, jt = 0 } = {}) => ({ t, i, g: 1, v, s: { a: { 'data-lock': '1' }, fx: { scale, tf: 'none', op: '1', ol: 'none' }, fl: Array.from({ length: fl }, () => ({})), jt: Array.from({ length: jt }, () => ({})), mask: [] } })

describe('стенд пилюль: момент хлопка', () => {
  it('по кадрам: заливка на экране в первом кадре хлопка / вспышки и мс от зачёта (pill claim)', () => {
    const frames = [fr(0, 1000, 0.4), fr(1, 1017, 0.52, { jt: 2 }), fr(2, 1033, 0.7, { jt: 4 }), fr(3, 1050, 0.86, { jt: 6 }), fr(4, 1067, 0.95, { jt: 6 }), fr(5, 1083, 0.99, { jt: 5 }), fr(6, 1100, 1, { scale: '1.004', fl: 2, jt: 4 }), fr(7, 1117, 1, { scale: '1.02', fl: 2 })]
    const events = [{ t: 1000.4, k: 'pill', type: 'claim' }, { t: 1100.2, k: 'pill', type: 'snap' }, { t: 1100.3, k: 'pill', type: 'win' }]
    const pops = popMoments(frames, events)
    expect(pops).toEqual([{ t: 1100, v: 1, ms: 100, frame: 7, src: 'кадр' }])
    expect(popLine(pops)).toBe('хлопок при заливке 1,00, через 100 мс после зачёта (кадр 7)')
    expect(jetStats(frames)).toEqual({ max: 6, frames: 6, first: 1017 })
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
    expect(jetStats([fr(0, 0, 0.2)])).toEqual({ max: 0, frames: 0, first: null })
  })
})

describe('стенд пилюль: капли из жидкости в записи', () => {
  const document = createDoc()
  const cs = el => ({ scale: 'none', transform: el.style.transform || 'none', opacity: el.style.opacity || '0', outline: 'none' })
  const jet = (pill, left, tf, op) => { const n = document.createElement('i'); n.className = 'wlJet'; n.style.cssText = `left:${left}px;top:60.0px;width:4.2px;height:4.2px`; n.style.transform = tf; n.style.opacity = op; pill.appendChild(n); return n }
  it('снимок: капли — отдельно от вспышек (jt), с местом и мигом полёта; плеер ставит их на те же места классом игры', () => {
    const a = fakePill(document)
    jet(a, 30, 'matrix(1, 0, 0, 1, 2, -14)', '0.8'); jet(a, 52, 'matrix(1, 0, 0, 1, -3, -6)', '1')
    const fl = document.createElement('i'); fl.style.cssText = 'position:absolute;inset:-4px;border:3px solid #4fb3ee'; a.appendChild(fl)
    const s = snapPillEl(a, cs)
    expect(s.fl).toHaveLength(1)                                           // кольцо вспышки — вспышка, капли в неё не попали
    expect(s.jt).toHaveLength(2)
    expect(s.jt[0]).toMatchObject({ w: 'pill', op: '0.8', tf: 'matrix(1, 0, 0, 1, 2, -14)' })
    expect(s.jt[0].css).toContain('left:30px')
    const b = fakePill(document)
    applySnap(b, s)
    const shown = b.querySelectorAll('.psFlash')
    expect(shown).toHaveLength(3)
    expect(shown.filter(n => n.classList.contains('wlJet')).map(n => [n.style.left, n.style.opacity, n.style.transform])).toEqual([['30px', '0.8', 'matrix(1, 0, 0, 1, 2, -14)'], ['52px', '1', 'matrix(1, 0, 0, 1, -3, -6)']])
    applySnap(b, { ...s, jt: [] }); expect(b.querySelectorAll('.wlJet')).toHaveLength(0) // следующий кадр — капель нет
    applySnap(b, { ...s, jt: undefined }); expect(b.querySelectorAll('.psFlash')).toHaveLength(1) // старая запись без jt
  })
  it('флаги кадра: «капли×N»; подпись состояния — есть / нет (число капель кадры таблицы не плодит); первые кадры флагов — «капли»', () => {
    const f = n => fr(0, 0, 0.5, { jt: n })
    expect(flagsOf(f(3))).toContain('капли×3')
    expect(flagsOf(f(0)).some(x => x.startsWith('капли'))).toBe(false)
    expect(stateSig(f(3))).toBe(stateSig(f(5)))
    expect(stateSig(f(3))).not.toBe(stateSig(f(0)))
    expect(flagStarts([fr(0, 10, 0.4), fr(1, 27, 0.5, { jt: 1 }), fr(2, 43, 0.6, { jt: 3 })]).filter(x => x.flag === 'капли')).toEqual([{ t: 27, i: 1, flag: 'капли' }])
  })
})
