import { describe, it, expect } from 'vitest'
import { snapPillEl, applySnap } from './pillStandSnap.js'
import { createDoc, fakePill } from './pillStandFakeDom.js'

const document = createDoc()
const pill = () => fakePill(document)
const cs = el => ({ scale: el.style.scale || 'none', transform: el.style.transform || 'none', opacity: el.style.opacity || '1', outline: el.style.outline || 'none' })

// Запись и просмотр стенда пилюль: кадр восстанавливается из снимка на пилюле плеера — тот же вид (атрибуты, заливка, кромка, маска, вспышки)
describe('стенд пилюль: снимок пилюли', () => {
  it('снимок → пилюля плеера → тот же снимок', () => {
    const a = pill()
    for (const [k, v] of Object.entries({ 'data-held': '1', 'data-wide': '1', 'data-mode': 'say', 'data-cap': 'Nice to meet you', 'data-live': '1', 'data-nudge': '1', 'data-lock': '1' })) a.setAttribute(k, v)
    Object.assign(a.style, { left: '50%', width: '78%', height: '11%', translate: '-50% calc(33dvh - 50%)', scale: '1.08', transform: 'translateX(-5px)' })
    a.querySelector('.wlPillFill').style.transform = 'translateX(-42.0%)'
    const sp = a.querySelector('.wlPillSparks i'); sp.style.transform = 'translateX(58.0%)'; sp.style.opacity = '1.00'; sp.style.setProperty('--fill', '0.580')
    const box = document.createElement('span'); box.className = 'racePhraseMask'
    ;[['Nice', 'full'], ['to', 'full'], ['meet', 'peek'], ['   ', 'hidden']].forEach(([t, w], i) => { if (i) box.appendChild(document.createTextNode(' ')); const b = document.createElement('b'); b.textContent = t; b.setAttribute('data-w', w); if (w === 'peek') b.style.setProperty('--peek', '0.6'); box.appendChild(b) })
    a.appendChild(box)
    const fl = document.createElement('div'); fl.style.cssText = 'position:absolute;inset:0;background:#fff;'; a.querySelector('.wlPillClip').appendChild(fl)
    const s = snapPillEl(a, cs)
    expect(s.a['data-testid']).toBeUndefined()
    expect(s.mask.map(m => m.w)).toEqual(['full', 'full', 'peek', 'hidden'])
    expect(s.fl).toHaveLength(1)
    const b = pill()
    applySnap(b, s)
    const s2 = snapPillEl(b, cs)
    expect(s2.a).toEqual(s.a)
    expect(s2.fill).toBe(s.fill)
    expect(s2.sp).toEqual(s.sp)
    expect(s2.mask).toEqual(s.mask)
    expect(s2.box).toEqual(s.box)
    expect(s2.fx.scale).toBe('1.08')
    expect(b.querySelectorAll('.psFlash')).toHaveLength(1)
    expect(b.style.visibility).toBe('visible')
  })
  it('следующий кадр: лишние атрибуты и маска снимаются, пустой снимок прячет пилюлю', () => {
    const b = pill()
    applySnap(b, { a: { 'data-lock': '1', 'data-nudge': '1' }, box: { left: '', width: '', height: '', translate: '' }, fill: 'translateY(10%)', sp: null, fx: { scale: 'none', tf: 'none', op: '1', ol: '' }, fl: [], mask: [{ t: 'a', w: 'full', p: '' }] })
    applySnap(b, { a: { 'data-lock': '1' }, box: { left: '', width: '', height: '', translate: '' }, fill: 'translateY(0.0%)', sp: null, fx: { scale: 'none', tf: 'none', op: '1', ol: '' }, fl: [], mask: [] })
    expect(b.hasAttribute('data-nudge')).toBe(false)
    expect(b.querySelector('.racePhraseMask')).toBeNull()
    expect(b.getAttribute('data-testid')).toBe('x')
    applySnap(b, null)
    expect(b.style.visibility).toBe('hidden')
    expect(b.hasAttribute('data-lock')).toBe(false)
  })
  it('нет пилюли — null', () => { expect(snapPillEl(null)).toBeNull() })
})
