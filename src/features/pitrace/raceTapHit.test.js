import { describe, it, expect, vi } from 'vitest'
import { hitPill, tapLine, zoneOf, trioTapLine, HIT_PAD_Y, GAP_MAX } from './raceTapHit.js'
import { logTrioTap } from './raceTapTrioLog.js'
import { setupScene } from './racePhraseSceneRig.js'
import { phraseStep, PHRASE_SPEED } from './raceStagesPhrases.js'
import { round1Turns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { WIDE_W, WIDE_H, LANE_EDGES } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Выбор пилюли тапом — строго по точке касания (замечание владельца: «уверен, что выбрал нужное, а показало, что неверно»): рамка, допуск, зазор, отыгранная, мимо
const R = (top, bottom, left = 20, right = 355) => ({ top, bottom, left, right })
const A = { id: 'a', cap: 'A', rect: R(100, 190) }, B = { id: 'b', cap: 'B', rect: R(230, 320) }

describe('hitPill: попадание точки тапа', () => {
  it('в рамку — та пилюля; перекрылись две — та, чей центр ближе к точке', () => {
    expect(hitPill({ x: 180, y: 150 }, [A, B])).toMatchObject({ hit: A, why: 'рамка' })
    expect(hitPill({ x: 180, y: 300 }, [A, B])).toMatchObject({ hit: B, why: 'рамка' })
    const C = { id: 'c', cap: 'C', rect: R(170, 260) }
    expect(hitPill({ x: 180, y: 175 }, [A, C]).hit).toBe(A); expect(hitPill({ x: 180, y: 186 }, [A, C]).hit).toBe(C)
  })
  it('рядом с рамкой — допуск по вертикали HIT_PAD_Y; дальше у одиночной — мимо', () => {
    expect(hitPill({ x: 180, y: 190 + HIT_PAD_Y }, [A])).toMatchObject({ hit: A, why: 'допуск' })
    expect(hitPill({ x: 180, y: 100 - HIT_PAD_Y - 1 }, [A])).toEqual({ hit: null, why: 'мимо' })
  })
  it('в зазоре между двумя — ближайшая по вертикали, но не дальше GAP_MAX; иначе мимо', () => {
    const far = { id: 'f', cap: 'F', rect: R(260, 350) } // зазор 190…260 — 70 px
    expect(hitPill({ x: 180, y: 190 + 20 }, [A, far])).toMatchObject({ hit: A, why: 'зазор' })
    expect(hitPill({ x: 180, y: 260 - 18 }, [A, far])).toMatchObject({ hit: far, why: 'зазор' })
    expect(hitPill({ x: 180, y: 190 + GAP_MAX + 3 }, [A, far])).toEqual({ hit: null, why: 'мимо' })
  })
  it('отыгранная не выбирается; под пальцем отыгранная и живая — живая; только отыгранная — «отыгранная»', () => {
    const S = { id: 's', cap: 'S', rect: R(120, 210), spent: true }
    expect(hitPill({ x: 180, y: 150 }, [S, A]).hit).toBe(A)
    expect(hitPill({ x: 180, y: 200 }, [S, A])).toMatchObject({ hit: A, why: 'допуск' }) // в рамке отыгранной, в допуске живой — живая
    expect(hitPill({ x: 180, y: 150 }, [S])).toEqual({ hit: null, why: 'отыгранная' })
  })
  it('мимо по горизонтали (за краем ленты) и без кандидатов', () => {
    expect(hitPill({ x: 2, y: 150 }, [A]).why).toBe('мимо'); expect(hitPill({ x: 180, y: 150 }, []).why).toBe('мимо')
  })
  it('журнал: «[tap] y=… x=… попал: «…» (rect …), кандидаты: …»', () => {
    const r = hitPill({ x: 180.4, y: 150.2 }, [A, { ...B, spent: true }])
    expect(tapLine({ x: 180.4, y: 150.2 }, [A, { ...B, spent: true }], r)).toBe('[tap] y=150 x=180 попал: «A» (rect 20,100–355,190, рамка), кандидаты: «A» 20,100–355,190 | «B» 20,230–355,320 (отыграна)')
    expect(tapLine({ x: 5, y: 5 }, [A], hitPill({ x: 5, y: 5 }, [A]))).toMatch(/^\[tap\] y=5 x=5 мимо, кандидаты: «A»/)
  })
})

describe('«Пальцами» (тройка по дорожкам): зона тапа = колонка 1/3', () => {
  it('колонки совпадают с разделителями дорожек; пилюля у края своей дорожки — в своей колонке', () => {
    const box = { left: 0, width: 375 }
    LANE_EDGES.forEach((e, i) => expect((e / 100) * 375).toBeCloseTo([125, 250][i], 6))
    expect([0, 124.9, 125, 249.9, 250, 374].map(x => zoneOf(x, box))).toEqual([0, 0, 1, 1, 2, 2])
    const pill = { left: 125 + 0.5, right: 250 - 0.5 } // пилюля шириной во всю дорожку — тап по её краю
    expect(zoneOf(pill.left, box)).toBe(1); expect(zoneOf(pill.right, box)).toBe(1)
  })
  it('журнал тапа тройки: дорожка, колонка, что под пальцем; несовпадение колонки помечено', () => {
    const log = vi.fn(), el = (lane, cap, rect) => ({ dataset: { lane: String(lane) }, getAttribute: () => cap, getBoundingClientRect: () => rect })
    const root = { getBoundingClientRect: () => ({ left: 0, width: 375 }), querySelectorAll: () => [el(0, 'cat', R(100, 260, 21, 104)), el(2, 'dog', R(120, 280, 271, 354))] }
    logTrioTap(root, 0, { x: 60, y: 200 }, 'верная дорожка', log)
    expect(log.mock.calls[0][0]).toBe('[tap] y=200 x=60 дорожка 1: попал: «cat» (rect 21,100–104,260) → верная дорожка, кандидаты: д1 «cat» 21,100–104,260 | д3 «dog» 271,120–354,280')
    expect(trioTapLine({ x: 200, y: 10 }, 0, 1, [], 'x')).toContain('дорожка 1 (≠ колонка 2!)')
  })
})

describe('сцена круга 1: тап по точке — та пилюля, куда попал палец', () => {
  const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
  const H = 812, Wd = 375
  const rig = o => {
    const s = setupScene(phraseStep('phrases1', round1Turns(ph, 's1'), { round: 1, mode: 'pick', voice: false, speed: PHRASE_SPEED }), o)
    const rectOf = k => { const y = (s.pool.y(k) / 100) * H, h = (WIDE_H / 100) * H, w = (WIDE_W / 100) * Wd; return { top: y - h / 2, bottom: y + h / 2, left: (Wd - w) / 2, right: (Wd + w) / 2 } }
    const take = s.pool.take
    s.pool.take = (lane, opt) => { const k = take(lane, opt); s.pool.taken[k].el.getBoundingClientRect = () => rectOf(k); return k }
    const center = k => { const r = rectOf(k); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 } }
    return { s, center, rectOf }
  }
  it('две пилюли на экране: тап по ВЕРХНЕЙ (дальше от центра экрана) выбирает именно её — а не ближайшую к центру; журнал [tap]', () => {
    const log = vi.fn(), { s, center } = rig({ log })
    s.go(500)
    let two = null
    for (let i = 0; i < 2000 && !two; i++) { s.go(16); const on = s.run.api.state().pills.filter(p => p.y > 12 && p.y < 88).sort((a, b) => a.y - b.y); if (on.length >= 2 && Math.abs(on[1].y - 50) < Math.abs(on[0].y - 50)) two = on }
    expect(two).toBeTruthy()
    const up = two[0], k = s.pool.taken.find(p => p.cap === round1Turns(ph, 's1')[0].cands.find(c => c.key === up.key).cap).k
    s.run.api.tap(1, center(k))
    if (up.right) { expect(s.fx.win).toHaveBeenCalledTimes(1); expect(s.fx.miss).not.toHaveBeenCalled() }
    else { expect(s.fx.miss).toHaveBeenCalledTimes(1); expect(s.fx.miss.mock.calls[0][0].rep.res.confusedWith).toBe(up.key) } // выбрана та, по которой тапнули
    expect(log.mock.calls.some(c => /^\[tap\] y=\d+ x=\d+ попал: «.+» \(rect .+, рамка\), кандидаты: /.test(c[0]))).toBe(true)
  })
  it('тап по центру пилюли — всегда она, в разные моменты хода', () => {
    for (let n = 0; n < 12; n++) {
      const { s, center } = rig()
      s.go(500 + n * 230)
      const on = s.run.api.state().pills.filter(p => p.y > 12 && p.y < 88)
      if (!on.length) continue
      const pickP = on[n % on.length], cand = round1Turns(ph, 's1')[0].cands.find(c => c.key === pickP.key)
      s.run.api.tap(1, center(s.pool.taken.find(p => p.cap === cand.cap).k))
      if (cand.right) expect(s.fx.win).toHaveBeenCalledTimes(1); else expect(s.fx.miss.mock.calls[0][0].rep.res.confusedWith).toBe(cand.key)
    }
  })
  it('тап мимо (за краем ленты) — ничего не выбирает и не ошибка; по отыгранной — ничего', () => {
    const log = vi.fn(), { s, center, rectOf } = rig({ log })
    s.go(500); s.go(1500)
    const k = s.pool.taken[0].k
    s.run.api.tap(1, { x: 2, y: center(k).y })
    expect(s.fx.win).not.toHaveBeenCalled(); expect(s.fx.miss).not.toHaveBeenCalled(); expect(log.mock.calls.at(-1)[0]).toMatch(/^\[tap\] .* мимо, кандидаты/)
    s.run.api.tap(1, { x: 180, y: rectOf(k).bottom + 200 })
    expect(s.fx.win).not.toHaveBeenCalled(); expect(s.fx.miss).not.toHaveBeenCalled()
  })
})
