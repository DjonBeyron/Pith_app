import { describe, it, expect } from 'vitest'
import { catPeek, CAT_SPOTS, HIDE_AFTER_MS, VOICE_AT } from './wordLaneCatPeek.js'
import { CAT_VIEWBOX } from './WordLaneCat.jsx'

// Пит: из низа выскакивает только голова и торчит в разных местах
function mk() {
  let t = 0
  const log = []
  const peek = catPeek({ now: () => t, show: x => log.push(['show', x, t]), hide: () => log.push(['hide', t]) })
  return { peek, log, at: ms => { t = ms } }
}

describe('Пит: голова выскакивает на голос и прячется в тишине', () => {
  it('тишина — голова спрятана; голос ≥ порога — выскакивает один раз; пока голос идёт — торчит', () => {
    const { peek, log, at } = mk()
    peek.voice(0); expect(log).toEqual([])
    at(100); peek.voice(VOICE_AT - 0.01); expect(log).toEqual([])
    at(200); peek.voice(0.5); expect(log.filter(e => e[0] === 'show')).toHaveLength(1)
    for (let t = 250; t <= 2000; t += 50) { at(t); peek.voice(0.4) }
    expect(log.filter(e => e[0] === 'show')).toHaveLength(1)     // не дёргается: уже торчит
    expect(peek.isUp()).toBe(true)
  })

  it('голос стих — прячется через HIDE_AFTER_MS (а не мгновенно, паузы между слогами не мигают)', () => {
    const { peek, at } = mk()
    at(0); peek.voice(0.6)
    at(HIDE_AFTER_MS - 50); peek.voice(0); expect(peek.isUp()).toBe(true)
    at(HIDE_AFTER_MS + 50); peek.voice(0); expect(peek.isUp()).toBe(false)
  })

  it('каждое новое появление — в другом месте, по кругу; два раза подряд не в одном', () => {
    const { peek, log, at } = mk()
    let t = 0
    for (let n = 0; n < CAT_SPOTS.length * 2; n++) { at(t); peek.voice(0.7); t += HIDE_AFTER_MS + 200; at(t); peek.voice(0); t += 100 }
    const xs = log.filter(e => e[0] === 'show').map(e => e[1])
    expect(xs).toHaveLength(CAT_SPOTS.length * 2)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).not.toBe(xs[i - 1])
    expect(new Set(xs).size).toBe(CAT_SPOTS.length)               // побывал во всех местах
  })

  it('места разбросаны по всей ширине и обходят середину (там в фазе ученика микрофон)', () => {
    expect(Math.min(...CAT_SPOTS)).toBeLessThan(25)
    expect(Math.max(...CAT_SPOTS)).toBeGreaterThan(75)
    expect(new Set(CAT_SPOTS).size).toBe(CAT_SPOTS.length)
    CAT_SPOTS.forEach(x => { expect(x).toBeGreaterThan(8); expect(x).toBeLessThan(92); expect(Math.abs(x - 50)).toBeGreaterThan(10) })
  })

  it('hold (реакция): торчит ровно на заданное время, даже без голоса, потом прячется', () => {
    const { peek, at } = mk()
    at(0); peek.hold(1500); expect(peek.isUp()).toBe(true)
    at(1400); peek.voice(0); expect(peek.isUp()).toBe(true)
    at(1600); peek.voice(0); expect(peek.isUp()).toBe(false)
  })

  it('кот показывает только голову, вдвое крупнее прежнего', () => {
    // viewBox обрезан по голове: 166×112 единиц спрайта 200×240 (тело не попадает в кадр)
    const [, , w, h] = CAT_VIEWBOX.split(' ').map(Number)
    expect(w).toBeLessThan(200); expect(h).toBeLessThan(130)
    expect(h).toBeLessThan(240 / 2)
  })
})
