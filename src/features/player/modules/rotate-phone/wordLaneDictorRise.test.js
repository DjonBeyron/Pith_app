import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { riseRep } from './wordLaneDictorRise.js'
import { planDictor, DICTOR_RISE_MS } from './wordLaneDictor.js'
import { RISE_MS, RISE_DELAY_MS } from './wordLaneRise.js'
import { END_TAIL_MS } from './wordLaneTimeline.js'
import { buildRecipe } from './wordLaneRecipe.js'

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8')

// Пилюли Пита после примера улетают вверх так же, как у ученика после верного ответа (взлёт + вспышка дорожки), и только потом начинается раунд ученика
describe('взлёт пилюль диктора (riseRep)', () => {
  const fakePool = () => {
    const risen = [], flashed = []
    return { risen, flashed, flashLane: l => flashed.push(l), rise: k => { risen.push(k); return k !== 9 } }
  }
  it('все пилюли повтора взлетают и вспыхивают своей дорожкой; чужие повторы и пилюли без номера в пуле не трогаются', () => {
    const pool = fakePool()
    const held = [{ p: { rep: 0, lane: 0 }, k: 4 }, { p: { rep: 0, lane: 1 }, k: 5 }, { p: { rep: 1, lane: 2 }, k: 6 }, { p: { rep: 0, lane: 2 }, k: null }]
    expect(riseRep(pool, held, 0)).toBe(2)
    expect(pool.risen).toEqual([4, 5]); expect(pool.flashed).toEqual([0, 1])
    expect(held.map(h => h.k)).toEqual([null, null, 6, null]) // взлетевшим k = null: кадровая заливка их больше не трогает, пул вернёт номер сам
  })
  it('взлёт не получился (нет полёта у пилюли) — номер остаётся: сцена вернёт её в пул обычным путём', () => {
    const pool = fakePool()
    const held = [{ p: { rep: 0, lane: 0 }, k: 9 }]
    expect(riseRep(pool, held, 0)).toBe(0); expect(held[0].k).toBe(9)
  })
  it('повтор договорён → взлёт: подключено в движке пилюль на последнем куске повтора, после хлопка и искр; реакции те же, что у ученика (flashLane + rise в пуле)', () => {
    const pills = read('./useWordLanePills.js')
    expect(pills).toContain('if (lastPiece) { light(h.p.rep); riseRep(pool, held, h.p.rep) }')
    expect(pills.indexOf('snapPill(pool.el(h.k), h.p.lane, { full: lastPiece })')).toBeLessThan(pills.indexOf('riseRep(pool, held, h.p.rep)'))
    expect(pills).toContain('pool.flashLane(e.pill.lane)'); expect(pills).toContain('pool.rise(k)') // ученик: те же вызовы пула
    const rise = read('./wordLaneDictorRise.js')
    expect(rise).toContain('pool.flashLane(h.p.lane)'); expect(rise).toContain('pool.rise(h.k)')
    expect(rise.split('\n').filter(l => !l.startsWith('//')).join('\n')).not.toMatch(/playNote|fx\.|\.win\(|xpApi|react\(/) // награды (нота, XP, кот) диктору не положены
  })
})

describe('время взлёта входит в ступень диктора', () => {
  const chunks = ["I'm", 'trying', 'to learn']
  const step = buildRecipe(chunks).rounds[0].steps[0]
  const plan = planDictor({ step, chunks, clipMode: () => false })
  it('listenMs = конец последнего повтора + хвост + взлёт: раунд ученика начинается после того, как пилюли улетели', () => {
    const last = plan.reps.at(-1)
    expect(DICTOR_RISE_MS).toBe(RISE_MS)
    expect(plan.listenMs).toBeCloseTo(last.at + last.ms + END_TAIL_MS + DICTOR_RISE_MS, 6)
  })
  it('взлёт укладывается в ступень: щелчок последнего куска ≈ за 180 мс до конца слова, взлёт стартует через RISE_DELAY_MS и идёт RISE_MS — к listenMs пилюли уже улетели', () => {
    const lastPiece = plan.pills.at(-1)
    const riseEnd = lastPiece.at + lastPiece.ms + RISE_MS // конец слова (щелчок + задержка = конец слова) + взлёт
    expect(RISE_DELAY_MS).toBe(180)
    expect(plan.listenMs).toBeGreaterThanOrEqual(riseEnd)
  })
  it('окно речи диктора закрывается не позже, чем раньше (микрофон возвращается сразу после слова, не после взлёта)', () => {
    const run = read('./wordLaneDictorRun.js')
    expect(run).toContain('left(Math.min(plan.listenMs - MIC_BACK_AFTER_MS, lastEnd + MIC_BACK_AFTER_MS))')
  })
})
