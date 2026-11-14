import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RaceMia from './RaceMia.jsx'
import { miaInit } from './mia/raceMia.js'
import { miaOn, MIA_KEY } from './mia/miaConfig.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const html = props => renderToStaticMarkup(createElement(RaceMia, props))
const inState = { ...miaInit(), phase: 'in', act: 'sprint', at: 1 }

describe('RaceMia: слой эпизода «Мия»', () => {
  it('Мии нет — только пустой слой, без коробки и спрайта (ничего не считается)', () => {
    const h = html({ mia: miaInit() })
    expect(h).toContain('class="wlMia"'); expect(h).toContain('data-testid="race-mia"'); expect(h).not.toContain('wlMiaSvg'); expect(h).not.toContain('wlMiaCat')
  })
  it('Мия пришла — коробка (svg) и спрайт Мии (серая кошка) на слое', () => {
    const h = html({ mia: inState })
    expect(h).toContain('wlMiaSvg'); expect(h).toContain('wlMiaCat'); expect(h).toContain('data-skin="mia2"'); expect(h).toContain('data-live="true"')
  })
  it('Мия уходит (анимация идёт) — слой ещё на экране; после ухода (off) — снова пустой', () => {
    expect(html({ mia: { ...inState, phase: 'out' } })).toContain('wlMiaSvg')
    expect(html({ mia: { ...inState, phase: 'off' } })).not.toContain('wlMiaSvg')
  })
  it('слой: aria-hidden, без перехвата касаний (стили), спрайт без фона', () => {
    const h = html({ mia: inState })
    expect(h).toContain('aria-hidden="true"'); expect(h).toMatch(/background:transparent/)
    expect(read('../../styles/player/modules/race-mia.css')).toMatch(/\.wlStage > \.wlMia \{[^}]*pointer-events: none/)
  })
})

describe('смена цвета дорожек при Мии', () => {
  const css = read('../../styles/player/modules/race-mia.css')
  it('цвета уровней зарегистрированы (@property) и переходят плавно на .wl[data-race]', () => {
    for (const v of ['--lvl1', '--lvl2', '--lvl3', '--lvl1-rgb', '--lvl2-rgb', '--lvl3-rgb']) { expect(css).toContain(`@property ${v}`); expect(css).toMatch(new RegExp(`transition:[^;]*${v} 0\\.9s`)) }
  })
  it("при .wl[data-mia='in'] все три цвета заменены; стиль подключён к гонке; игра ставит атрибут по фазе", () => {
    expect(css).toMatch(/\.wl\[data-mia='in'\] \{[^}]*--lvl1: #e0a44e[^}]*--lvl2: #d6783e[^}]*--lvl3: #9ca3b2/s)
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-mia.css'")
    const game = read('../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(game).toContain("data-mia={f.rh.mia?.mia?.phase === 'in' ? 'in' : undefined}"); expect(game).toContain('<RaceMia mia={f.rh.mia.mia}')
  })
  it('есть уважение к reduced-motion (переход цвета выключается)', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[^}]*\.wl\[data-race\] \{ transition: none/s)
  })
})

describe('miaOn: включатель эпизода', () => {
  const st = v => ({ getItem: k => (k === MIA_KEY ? v : null) })
  it('по умолчанию включён; только "0" выключает; сбой хранилища — включён', () => {
    expect(miaOn(st(null))).toBe(true); expect(miaOn(st('1'))).toBe(true); expect(miaOn(st('0'))).toBe(false)
    expect(miaOn({ getItem() { throw new Error('нет доступа') } })).toBe(true)
  })
})

describe('игра: события раунда идут в машину Мии', () => {
  it('useRaceActs подключает машину: вход в стадию, win / miss / fail, вид mia в результате хука', () => {
    const src = read('./useRaceActs.js')
    expect(src).toContain("miaEvent({ t: 'enter', stage: running })"); expect(src).toContain('miaEvent({ t: kind, stage: running, idx: info?.idx })'); expect(src).toContain('mia: miaView')
    expect(src).toContain("!(kind === 'win' && info?.last === false)")
  })
  it('ступени очереди несут step.boost = { k: 1 }; движок читает его', () => {
    expect(read('./raceStageKit.js')).toContain('boost: { k: 1 }')
    expect(read('../player/modules/rotate-phone/wordLaneStudent.js')).toContain('boost: step.boost ?? null')
  })
})
