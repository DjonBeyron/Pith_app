import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { REST_A, RUN_A } from '../player/modules/rotate-phone/wordLaneConveyor.js'

// Замечания владельца 2026-11-08 (iPhone 375×812): взлёт верной пилюли поверх соседних; на ленте «Фраз» две нити по бокам пилюли, узор тусклее везде; лента не заходит на кнопки сверху; подложки итога непрозрачные
const read = n => readFileSync(new URL(`../../styles/player/modules/${n}`, import.meta.url), 'utf8')
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (c, sel) => new RegExp(`${sel.replace(/[.[\]()*+]/g, '\\$&')} \\{([^}]*)\\}`).exec(c)?.[1] ?? ''

describe('взлёт пилюли поверх соседних', () => {
  it('data-rise и data-hot — z-index 1 (у остальных пилюль auto), ниже подписей и панели', () => {
    const c = strip(read('word-lane-pill.css'))
    expect(rule(c, '.wlPill[data-rise], .wlPill[data-hot]')).toContain('z-index: 1')
    expect(rule(c, '.wlPill')).not.toContain('z-index')
  })
})

describe('лента «Фраз»: две нити и верх под кнопками', () => {
  const c = strip(read('word-lane-wide.css'))
  it('средняя колонка на ленте: слой узора от 8 % до 92 % экрана, четыре слоя фона — узелки и штрихи у левого и правого края', () => {
    const r = rule(c, '.wl[data-race][data-tape] .wlLanes i:nth-child(2)::before')
    expect(r).toContain('left: calc(-76% - 7px)'); expect(r).toContain('width: calc(252% + 14px)')
    expect((-0.76 + 1) / 3).toBeCloseTo(0.08, 3); expect((-0.76 + 2.52 + 1) / 3).toBeCloseTo(0.92, 3) // колонка — треть экрана, левый край на 1/3
    const bg = /background:\s*([^;]*);/.exec(r)[1].split(/,(?![^(]*\))/).map(s => s.trim())
    expect(bg).toHaveLength(4)
    expect(bg[0]).toMatch(/^var\(--run-knot\) left 0/); expect(bg[1]).toMatch(/^var\(--run-knot\) right 0/)
    expect(bg[2]).toMatch(/^var\(--run-line\) 7px 0/); expect(bg[3]).toMatch(/^var\(--run-line\) calc\(100% - 7px\) 0/)
    expect(rule(c, '.wl[data-race][data-tape] .wlLanes i:nth-child(2)')).toContain('contain: none')
  })
  it('лента целиком сдвинута вниз на 80 px (верх — safe + 90 px, под «назад» / паузой и строкой XP / админа) и обрезает слой узора', () => {
    const r = rule(c, '.wl[data-race][data-tape] .wlLanes')
    expect(r).toContain('transform: translateY(80px)'); expect(r).toContain('contain: paint')
    expect(rule(c, '.wl[data-race] .wlLanes')).toMatch(/transition: opacity 0\.8s ease, transform 0\.6s/)
    expect(c).not.toMatch(/filter\s*:/)
  })
  it('три дорожки «Пинг-понга» — одна нить по центру, как раньше', () => {
    const r = rule(strip(read('word-lane-lane-run.css')), '.wl[data-race] .wlLanes i::before')
    expect(r).toContain('left: calc(50% - 7px)'); expect(r).toContain('width: 14px')
  })
})

describe('узор конвейера тусклее везде', () => {
  it('opacity слоя = --run-a × 0,65: покой ≈ 0,09, ход ≈ 0,34', () => {
    const r = rule(strip(read('word-lane-lane-run.css')), '.wlLanes i::before')
    expect(r).toContain('--run-k: 0.65'); expect(r).toContain('opacity: calc(var(--run-a, 0.14) * var(--run-k))')
    expect(REST_A * 0.65).toBeCloseTo(0.09, 2); expect(RUN_A * 0.65).toBeCloseTo(0.34, 2)
  })
})

describe('итог: непрозрачные подложки', () => {
  it('карточки слов и фраз — оттенок поверх плотного тела var(--wl-card), без полупрозрачного фона', () => {
    for (const [f, sel] of [['race-weak.css', '.raceWeakChip'], ['race-phrases-weak.css', '.racePhWRow']]) {
      const r = rule(strip(read(f)), sel)
      expect(r).toContain('background: linear-gradient(rgba(var(--wk), 0.12), rgba(var(--wk), 0.12)), var(--wl-card, #14171c)')
    }
  })
  it('экран итога непрозрачный, содержимое над блеском узора; ни filter, ни backdrop-filter в файлах итога', () => {
    const c = strip(read('race-final.css'))
    expect(rule(c, '.raceSum.raceFinal.wlTurn')).toContain('background: var(--wl-plate-tex), var(--wl-plate-tex), #0b0d11')
    expect(rule(c, '.raceSum.raceFinal.wlTurn > *')).toContain('z-index: 1')
    for (const f of ['race-summary.css', 'race-final.css', 'race-weak.css', 'race-phrases-weak.css', 'race-accuracy.css', 'race-metrics.css']) expect(strip(read(f))).not.toMatch(/filter\s*:/)
  })
})
