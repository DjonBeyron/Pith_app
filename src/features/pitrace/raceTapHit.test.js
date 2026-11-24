import { describe, it, expect, vi } from 'vitest'
import * as tapHit from './raceTapHit.js'
import { zoneOf, trioTapLine } from './raceTapHit.js'
import { logTrioTap } from './raceTapTrioLog.js'
import { WIDE_W, WIDE_H, LANE_EDGES } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Выбор пилюли тапом — строго по точке касания (замечание владельца: «уверен, что выбрал нужное, а показало, что неверно»): рамка, допуск, зазор, отыгранная, мимо
const R = (top, bottom, left = 20, right = 355) => ({ top, bottom, left, right })
const A = { id: 'a', cap: 'A', rect: R(100, 190) }, B = { id: 'b', cap: 'B', rect: R(230, 320) }

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

describe('тап по широкой ленте фраз удалён вместе с тап-кругами («Пойми», «Узнай»; владелец 2026-11-24)', () => {
  it('выбора пилюли по точке (hitPill) и его журнала больше нет; сцена фраз на тап не отвечает', () => {
    expect(tapHit.hitPill).toBeUndefined(); expect(tapHit.tapLine).toBeUndefined()
  })
})
