import { describe, it, expect } from 'vitest'
import { catPeek, CAT_SPOTS, HIDE_AFTER_MS, HIDE_MS, VOICE_AT } from './wordLaneCatPeek.js'
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
    for (let n = 0; n < CAT_SPOTS.length * 2; n++) { at(t); peek.voice(0.7); t += HIDE_AFTER_MS + 200; at(t); peek.voice(0); t += HIDE_MS + 50 }
    const xs = log.filter(e => e[0] === 'show').map(e => e[1])
    expect(xs).toHaveLength(CAT_SPOTS.length * 2)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).not.toBe(xs[i - 1])
    expect(new Set(xs).size).toBe(CAT_SPOTS.length)               // побывал во всех местах
  })

  it('голова ещё уходит вниз (HIDE_MS) — новый вызов не меняет место: --cat-x не перескакивает, пока голова видна на полпути', () => {
    const { peek, log, at } = mk()
    at(0); peek.voice(0.7)
    at(HIDE_AFTER_MS + 100); peek.voice(0)                       // спряталась
    expect(peek.isUp()).toBe(false)
    at(HIDE_AFTER_MS + 100 + HIDE_MS - 50); peek.voice(0.7)      // зовут, пока она ещё едет вниз
    at(5000); peek.voice(0); at(5000 + HIDE_AFTER_MS + 100); peek.voice(0)
    at(5000 + HIDE_AFTER_MS + 100 + HIDE_MS + 10); peek.voice(0.7) // ушла совсем — место новое
    const xs = log.filter(e => e[0] === 'show').map(e => e[1])
    expect(xs).toEqual([CAT_SPOTS[0], CAT_SPOTS[0], CAT_SPOTS[1]])
  })

  it('места: голова (полэкрана шириной) целиком в кадре — центр от 25 до 75 %, слева и справа, середину (микрофон) обходят', () => {
    expect(Math.min(...CAT_SPOTS)).toBeLessThan(35)
    expect(Math.max(...CAT_SPOTS)).toBeGreaterThan(65)
    expect(new Set(CAT_SPOTS).size).toBe(CAT_SPOTS.length)
    CAT_SPOTS.forEach(x => { expect(x).toBeGreaterThanOrEqual(25); expect(x).toBeLessThanOrEqual(75); expect(Math.abs(x - 50)).toBeGreaterThan(10) })
  })

  it('hold (реакция): торчит ровно на заданное время, даже без голоса, потом прячется', () => {
    const { peek, at } = mk()
    at(0); peek.hold(1500); expect(peek.isUp()).toBe(true)
    at(1400); peek.voice(0); expect(peek.isUp()).toBe(true)
    at(1600); peek.voice(0); expect(peek.isUp()).toBe(false)
  })

  it('кот показывает только голову, вдвое крупнее прежнего', () => {
    // viewBox по голове целиком: от ушей (y≈20) до шеи (подбородок y≈142), без ног и хвоста: единицы спрайта 200×240
    const [x, y, w, h] = CAT_VIEWBOX.split(' ').map(Number)
    expect(y).toBeLessThanOrEqual(20); expect(y + h).toBeGreaterThanOrEqual(142 + 10) // голова не срезана: ни ушей, ни подбородка с шеей
    expect(x).toBeLessThanOrEqual(14); expect(x + w).toBeGreaterThanOrEqual(172)      // и по бокам (уши, усы)
    expect(y + h).toBeLessThan(200)                                                    // а тело и ноги в кадр не попадают
  })
})
