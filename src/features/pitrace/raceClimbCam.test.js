import { describe, it, expect } from 'vitest'
import { laneOf, xOf, LANE_X, worldShift, islandBottom, jumpOf, heroFrames, GAP_DVH, HERO_BOTTOM_DVH, JUMP_MS, SLIP_MS, JUMP_APEX_DVH } from './raceClimbCam.js'

describe('камера и прыжки «Вершины»: чистая геометрия', () => {
  it('островки зигзагом: 1 — слева, 2 — посередине, 3 — справа, 4 — снова слева; земля посередине', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(laneOf)).toEqual([0, 1, 2, 0, 1, 2, 0])
    expect(laneOf(0)).toBe(1)
    expect([1, 2, 3, 4].map(xOf)).toEqual([LANE_X[0], LANE_X[1], LANE_X[2], LANE_X[0]])
  })
  it('камера за героем: герой на ступени r — остров r под ним на высоте героя, мир сдвинут вниз на r · GAP; между островами ≈ 45 % высоты', () => {
    expect(GAP_DVH).toBe(45)
    expect(worldShift(0)).toBe(0); expect(worldShift(3)).toBe(3 * GAP_DVH)
    for (const r of [0, 1, 2, 5]) expect(islandBottom(r, r)).toBe(HERO_BOTTOM_DVH) // остров героя всегда на одном месте экрана
    expect(islandBottom(3, 2) - islandBottom(2, 2)).toBe(GAP_DVH); expect(islandBottom(1, 2)).toBe(HERO_BOTTOM_DVH - GAP_DVH) // следующий выше, предыдущий ниже экрана
    expect(HERO_BOTTOM_DVH).toBe(38) // герой на ≈ 60 % высоты сверху
  })
  it('прыжок: вверх — сальто, вниз — дуга без сальто, на месте — дрожь; дорожки отправления и прибытия', () => {
    const up = jumpOf(1, 2), down = jumpOf(3, 2), stay = jumpOf(1, 1)
    expect(up).toMatchObject({ kind: 'up', flip: true, ms: JUMP_MS, fromX: LANE_X[0], toX: LANE_X[1] })
    expect(JUMP_MS).toBe(700)
    expect(down).toMatchObject({ kind: 'down', flip: false, ms: SLIP_MS, fromX: LANE_X[2], toX: LANE_X[1] })
    expect(stay.kind).toBe('stay'); expect(jumpOf(0, 1).fromX).toBe(LANE_X[1]) // с земли — с середины на левую
  })
  it('кадры сальто: поворот ровно на 360°, дуга вверх, приседание в конце; только transform / left, без filter', () => {
    const f = heroFrames(jumpOf(1, 2))
    const tr = f.arc.map(k => k.transform)
    expect(tr[0]).toContain('rotate(0deg)'); expect(tr.at(-1)).toContain('rotate(360deg)'); expect(tr.some(t => t.includes('rotate(180deg)') && t.includes(`translateY(${-JUMP_APEX_DVH}dvh)`))).toBe(true)
    expect(tr.some(t => /scale\(1\.\d+, 0\.\d+\)/.test(t))).toBe(true) // приседание
    expect(f.options.arc.duration).toBe(700); expect(f.options.move.duration).toBe(700)
    expect(f.move.map(k => k.left)).toEqual(['17.00%', '50.00%'])
    expect(JSON.stringify(f)).not.toContain('filter')
  })
  it('кадры соскальзывания: дуга вниз без сальто (нет поворота на 360°), дрожание на месте', () => {
    const down = heroFrames(jumpOf(3, 2)).arc.map(k => k.transform).join(' ')
    expect(down).not.toContain('360deg'); expect(down).not.toContain('180deg')
    const stay = heroFrames(jumpOf(1, 1))
    expect(stay.arc.length).toBeGreaterThanOrEqual(4); expect(stay.move[0].left).toBe(stay.move[1].left)
  })
  it('lite (слабое устройство): без дуги и сальто, только перенос на дорожку с затуханием', () => {
    const f = heroFrames(jumpOf(1, 2), true)
    expect(JSON.stringify(f.arc)).not.toContain('transform'); expect(f.arc[0].opacity).toBeLessThan(1)
    expect(f.options.move.duration).toBeLessThan(JUMP_MS)
    expect(f.move.map(k => k.left)).toEqual(['17.00%', '50.00%'])
  })
})
