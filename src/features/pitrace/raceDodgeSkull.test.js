import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createDodge, leadOf, HEAD_TOP, HEAD_H, SKULL_TOP, SKULL_DROP, JUMP_MS, ASIDE } from './raceDodge.js'
import { measureHead } from './raceDodgeDrive.js'
import { PILL_H, SPEED, ENTER_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { SPEED_STEP, SPRINT_MAX } from './raceWords.js'
import { ROUND2_BOOST, ROUND2_STEP } from './raceExtraRound.js'
import { MIA } from './mia/raceMia.js'

// Комментарий владельца 2026-11-25 (журнал игры, iPhone): «Когда опускаются капсулы, Пит уворачивается от них, нужно чтобы он делал это позже, когда они достигнут границы именно его головы, а не ушей,
// то есть чуточку позже, но он успевал вернуться». Было: порог — от верхнего края головы С УШАМИ, за 0,3 с пути пилюли (8–14 % высоты; в журнале владельца «низ пилюли 70,8 %» при верхе головы ≈ 80,5 %).
// Стало: порог — от верха ЧЕРЕПА (геометрия из SVG кота), за время самого прыжка с запасом.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const kit = JSON.parse(read('../scene/v2/sprites/mascot/kit.json'))
const pill = (o = {}) => ({ id: 'a', rep: 0, lane: 1, y: 20, speed: 1, state: 'fly', ...o })
const MAX_SPEED = SPEED_STEP ** (SPRINT_MAX - 1) * ROUND2_BOOST * ROUND2_STEP ** (SPRINT_MAX - 1) * MIA.BOOST // с запасом: разгон (+5 % на пилюлю), круг ещё +10 % и +5 % на пилюлю, у Мии ×1,15 (в журнале владельца максимум ×2,06)

describe('уворот Пита — по границе головы, а не ушей', () => {
  it('SKULL_DROP — из SVG кота: верх черепа между ушами (контур головы kit.json, обводка 7) в кадре головы CAT_VIEWBOX', () => {
    const [, vy, , vh] = /CAT_VIEWBOX = '([\d. ]+)'/.exec(read('../player/modules/rotate-phone/WordLaneCat.jsx'))[1].split(' ').map(Number)
    const outline = /<path d="([^"]+)" fill="none" stroke="#582e99" stroke-width="(\d+)"/.exec(kit.head)
    const ys = [...outline[1].matchAll(/-?\d+(?:\.\d+)?[ ,](-?\d+(?:\.\d+)?)/g)].map(m => +m[1])
    const half = +outline[2] / 2, toView = y => kit.fit.ty + kit.fit.k * y
    const ears = toView(Math.min(...ys) - half)        // кончики ушей — самая верхняя точка контура
    const skull = toView(151.3 - half)                 // верх черепа: точка контура между ушами
    expect(outline[1]).toContain('296.7 151.3')        // середина головы по x (296,7 при ширине контура 95…498) — верх черепа
    expect((skull - vy) / vh).toBeCloseTo(SKULL_DROP, 2)
    expect((ears - vy) / vh).toBeLessThan(0.06)        // уши почти у верхнего края кадра: прежний порог мерил от них
    expect(SKULL_TOP).toBeCloseTo(HEAD_TOP + SKULL_DROP * HEAD_H, 5)
  })
  it('привод меряет верх черепа по DOM: 375×812 — на ≈ 29 px ниже верхнего края головы', () => {
    const m = measureHead({ parentElement: { offsetWidth: 375, offsetHeight: 812 }, offsetWidth: 187.5, offsetHeight: 159.5 })
    expect(((m.skullTop - m.headTop) / 100) * 812).toBeCloseTo(159.5 * SKULL_DROP, 1)
    expect(m.skullTop).toBeGreaterThan(m.headTop + 3)
  })
  it('прыжок начинается ПОЗЖЕ прежнего: там, где прыгал раньше, Пит ещё стоит; у порога черепа — прыгает', () => {
    for (const speed of [1, 1.22, 1.6, 2.06]) {
      const m = createDodge({ lanes: [1, 2] }); m.start()
      const old = HEAD_TOP - Math.min(14, Math.max(8, SPEED * speed * 0.3)) // прежний порог (от верха ушей)
      expect(m.step([pill({ speed, y: old - PILL_H / 2 + 0.2 })]).plans).toEqual([])
      expect(m.step([pill({ speed, y: HEAD_TOP - leadOf(speed) - PILL_H / 2 + 0.2 })]).plans).toEqual([]) // на том же упреждении, но от ушей — тоже стоит
      const at = SKULL_TOP - leadOf(speed) - PILL_H / 2
      expect(m.step([pill({ speed, y: at - 0.2 })]).plans).toEqual([])
      expect(m.step([pill({ speed, y: at + 0.2 })]).plans).toEqual([expect.objectContaining({ kind: 'jump', toLane: 2 })])
      const laterS = (SKULL_TOP - leadOf(speed) - old) / (SPEED * speed)
      expect(laterS).toBeGreaterThan(0.1); expect(laterS).toBeLessThan(0.3) // «чуточку позже»: на 0,1–0,3 с
    }
  })
  it('успевает увернуться: прыжок (JUMP_MS) кончается раньше, чем низ пилюли дойдёт до черепа — на любой скорости до максимальной', () => {
    expect(MAX_SPEED).toBeGreaterThan(2.06)
    for (const speed of [0.5, 1, 1.5, 2.06, MAX_SPEED]) {
      const travel = (SPEED * speed * JUMP_MS) / 1000 // путь пилюли за прыжок, % высоты
      expect(leadOf(speed)).toBeGreaterThan(travel)
      expect(leadOf(speed) - travel).toBeLessThan(4.1) // и не раньше нужного: к концу прыжка пилюля уже у самой головы
    }
  })
  it('успевает вернуться: из стороны — обратно на дорожку, как только пилюля прошла; следующая пилюля к этому времени ещё далеко от головы', () => {
    for (const speed of [1, 2.06, MAX_SPEED]) {
      const m = createDodge({ lanes: [1, 1, 0] }); m.start()
      const v = SPEED * speed, at = SKULL_TOP - leadOf(speed) - PILL_H / 2 + 0.1
      expect(m.step([pill({ speed, y: at })]).plans[0]).toMatchObject({ kind: 'jump', toLane: ASIDE, same: true })
      expect(m.backIn([pill({ speed, y: at })])).toBeGreaterThan(JUMP_MS) // ждёт прохода пилюли и прыгает обратно
      const gone = 100 - (v * JUMP_MS) / 1000 + PILL_H / 2
      expect(m.step([pill({ speed, y: gone + 0.1 })]).plans[0]).toMatchObject({ kind: 'jump', toLane: 1 }) // вернулся на дорожку следующей
      const nextToHead = ((SKULL_TOP - leadOf(speed * SPEED_STEP) - PILL_H / 2 - ENTER_Y) / (v * SPEED_STEP)) * 1000 // следующая пилюля выезжает не раньше возврата (речь ждёт left()) и едет до порога дольше прыжка
      expect(nextToHead).toBeGreaterThan(JUMP_MS * 3)
    }
  })
})
