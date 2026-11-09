import { describe, it, expect, vi, afterEach } from 'vitest'
import { createPool, POOL } from '../player/modules/rotate-phone/wordLanePool.js'
import { FLIGHT_MS } from '../player/modules/rotate-phone/wordLaneMotion.js'
import { msToExit, coastTail } from '../player/modules/rotate-phone/wordLaneCoast.js'
import { ENTER_Y, SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { setupScene } from './racePhraseSceneRig.js'
import { phraseStep, PHRASE_SPEED, PHRASE_GAP_MS } from './raceStagesPhrases.js'
import { round1Turns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { CENTER_Y } from './racePhraseScene.js'

vi.mock('../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))

// Доезд пилюль при смене ступени (wordLaneCoast.js, замечание владельца 2026-11-07: «пилюля должна просто уехать, а не исчезнуть, и это не должно блокировать Пита»):
// кончившаяся ступень отдаёт едущие пилюли на доезд (pool.coast) — они едут той же анимацией до EXIT_Y, новая сцена (новый пул из тех же элементов) их не берёт, первая новая пилюля — не ближе gap за ними.
function fakeEl(parts = {}) {
  const attrs = new Map()
  return {
    style: { setProperty(k, v) { this[k] = v } }, dataset: {}, parts,
    setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, hasAttribute: k => attrs.has(k),
    animate: () => ({ currentTime: 0, playbackRate: 1, cancel: vi.fn(), finished: new Promise(() => {}) }),
    querySelector: sel => parts[sel] ?? null, querySelectorAll: () => [],
  }
}
const rig = () => { const pills = Array.from({ length: POOL }, () => fakeEl({ '.wlPillFill': fakeEl(), '.wlGhost': fakeEl(), '.wlPace': fakeEl() })); const root = { querySelectorAll: sel => (sel === '[data-pill]' ? pills : []) }; return { pills, root, pool: createPool(root) } }
afterEach(() => vi.useRealTimers())

describe('пул: доезд при смене ступени', () => {
  it('msToExit — по часам полёта и скорости; ещё не выехала или ушла — null', () => {
    expect(msToExit({ currentTime: FLIGHT_MS / 2, playbackRate: 0.5 })).toBeCloseTo(FLIGHT_MS, 5)
    expect(msToExit({ currentTime: -100, playbackRate: 1 })).toBeNull(); expect(msToExit({ currentTime: FLIGHT_MS + 1, playbackRate: 1 })).toBeNull(); expect(msToExit(null)).toBeNull()
  })
  it('coast: едущая пилюля остаётся (data-coast), giveAll её не трогает, новый пул её не берёт; доехала — в пул, data-coast снят; невыехавшая уходит сразу', () => {
    vi.useFakeTimers()
    const { pills, root, pool } = rig()
    const k = pool.take(1, { wide: true, speed: 0.5, cap: 'Nice to meet you' })
    const wait = pool.take(1, { wide: true, speed: 0.5, atMs: -2000 }) // ещё за верхним краем
    const a = pool.anims()[0]; a.currentTime = FLIGHT_MS * 0.6; a.playbackRate = 0.5
    pool.anims()[1].currentTime = -1000
    const gone = vi.fn()
    expect(pool.coast(gone)).toEqual([k])
    pool.giveAll()
    expect(pills[k].getAttribute('data-coast')).toBe('1'); expect(pills[k].getAttribute('data-held')).toBe('1')
    expect(pills[wait].getAttribute('data-held')).toBeNull() // невыехавшая — в пул сразу
    expect(coastTail(root)).toBeCloseTo(ENTER_Y + (118 - ENTER_Y) * 0.6, 3); expect(pool.tail()).toBe(coastTail(root))
    const next = createPool(root) // следующая сцена
    const taken = Array.from({ length: POOL }, () => next.take(1, {})).filter(x => x != null)
    expect(taken).toHaveLength(POOL - 1); expect(taken).not.toContain(k)
    vi.advanceTimersByTime((FLIGHT_MS * 0.4) / 0.5 - 50); expect(gone).not.toHaveBeenCalled(); expect(pills[k].getAttribute('data-coast')).toBe('1')
    vi.advanceTimersByTime(100)
    expect(gone).toHaveBeenCalledWith(k); expect(pills[k].getAttribute('data-coast')).toBeNull(); expect(pills[k].getAttribute('data-held')).toBeNull()
    expect(coastTail(root)).toBeNull()
    next.giveAll(); expect(next.take(1, {})).not.toBeNull()
  })
})

const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const pick = () => phraseStep('phrases1', round1Turns(ph, 's1'), { round: 1, mode: 'pick', voice: false, speed: PHRASE_SPEED })
const untilCenter = (s, key) => { for (let i = 0; i < 3000; i++) { const p = s.run.api.state().pills.find(x => x.key === key); if (p && Math.abs(p.y - CENTER_Y) < 3) return p; s.go(16) } return null }

describe('сцена «Фраз»: круг кончился — пилюли доезжают, Пита не держат', () => {
  it('fx.finished приходит, пока отыгранные ещё едут; stop() после него отдаёт их на доезд (pool.coast) с журналом; «доехала» — по одной', () => {
    const log = vi.fn(); const s = setupScene(pick(), { log })
    for (const t of round1Turns(ph, 's1')) { s.go(300); expect(untilCenter(s, t.target.key)).toBeTruthy(); s.run.api.tap() }
    for (let i = 0; i < 200 && !s.fx.finished.mock.calls.length; i++) s.go(16)
    expect(s.fx.finished).toHaveBeenCalledTimes(1)
    const riding = s.run.api.state().spent
    expect(riding.length).toBeGreaterThan(0) // директор идёт дальше, не дожидаясь пустой ленты
    expect(riding.every(p => p.y < 100)).toBe(true)
    s.run.stop()
    expect(s.pool.coasted.length).toBeGreaterThanOrEqual(riding.length)
    expect(log.mock.calls.map(c => c[0])).toContain(`[phrases] круг 1 кончился: доезжают ${riding.length} пилюль`)
    s.pool.onGone(s.pool.coasted[0]); expect(log.mock.calls.at(-1)[0]).toMatch(/^\[phrases\] доехала «.+»$/)
  })
  it('стоп посреди круга (пауза, перезапуск) — без доезда: пилюли убирает пул', () => {
    const s = setupScene(pick()); s.go(3000); s.run.stop()
    expect(s.pool.coasted).toBeUndefined()
  })
  it('первая пилюля нового круга выезжает не ближе gap за последней доезжающей (pool.tail), а Пит говорит сразу', () => {
    const tail = ENTER_Y + (SPEED * PHRASE_SPEED * 1000) / 1000 // доезжающая выехала секунду назад
    const s = setupScene(pick(), { tail })
    s.go(300); expect(s.fx.pre).toHaveBeenCalledTimes(1) // Пит не ждёт
    s.go(PHRASE_GAP_MS - 1000 - 400); expect(s.pool.taken).toHaveLength(0)
    s.go(200); expect(s.pool.taken).toHaveLength(1)
  })
  it('журнал старта хода — скорость и gap: Пит говорит — ранний выезд вместе с репликой; без реплики — «пилюли едут»', () => {
    const sp = String(PHRASE_SPEED).replace('.', ','), lines = s => s.mock.calls.map(c => c[0])
    const log = vi.fn(); setupScene(pick(), { log, pit: 2116 }).go(16)
    expect(lines(log).find(l => l.includes('вместе с репликой'))).toMatch(new RegExp(`^\\[phrases\\] круг 1 «Пойми» \\(тап фразы\\), ход 1/3: пилюля выезжает вместе с репликой Пита \\(2116 мс\\) с -?\\d+ % высоты, speed ${sp}, gap ${PHRASE_GAP_MS} мс$`))
    const quiet = vi.fn(); setupScene(pick(), { log: quiet }).go(400)
    expect(lines(quiet)).toContain(`[phrases] круг 1 «Пойми» (тап фразы), ход 1/3: пилюли едут, speed ${sp}, gap ${PHRASE_GAP_MS} мс`)
  })
})
