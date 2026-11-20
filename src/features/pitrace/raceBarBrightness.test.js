import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Журнал владельца v3.3.301: пустой бар сверху то тусклее, то ярче — бар заставки (ореол + дорожка) светлее бара в игре (одна дорожка). Яркость пустой подложки должна совпадать.
const css = f => readFileSync(new URL(`../../styles/player/modules/${f}`, import.meta.url), 'utf8')
const alpha = (src, sel) => Number(src.match(new RegExp(`${sel.replace('.', '\\.')} \\{[^}]*background: rgba\\(255, 255, 255, ([0-9.]+)\\)`))?.[1])

describe('пустой бар: одинаковая яркость в заставке и в игре', () => {
  it('ореол + дорожка заставки (наложение) = подложка бара игры', () => {
    const c = css('race-charge.css'), b = css('race-bar.css')
    const stacked = 1 - (1 - alpha(c, '.raceChargeHalo')) * (1 - alpha(c, '.raceChargeTrack'))
    expect(alpha(b, '.raceBarTrack')).toBeCloseTo(stacked, 2)
  })
})
