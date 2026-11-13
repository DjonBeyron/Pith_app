import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RacePanel from './RacePanel.jsx'

// Верхняя панель гонки, затемнение сцены и узор фона (CONCEPT_RACE.md, «Верхняя панель», v3.3.115). Панель — только у гонки; репетиция и нода остаются с крестиком.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const css = read('../../styles/player/modules/race-panel.css'), bg = read('../../styles/player/modules/race-stage-bg.css')
const rule = (text, sel) => { const i = ('\n' + text).indexOf(`\n${sel} {`); return i < 0 ? '' : text.slice(i, text.indexOf('}', i)) }

describe('панель: назад, пауза', () => {
  const html = (p = {}) => renderToStaticMarkup(createElement(RacePanel, { onBack: () => {}, onPause: () => {}, onResume: () => {}, ...p }))
  it('слева общая кнопка «назад» приложения (BackButton: класс backBtn, стрелка), справа «пауза»', () => {
    const h = html()
    expect(h).toContain('class="backBtn raceBack"'); expect(h).toContain('d="M15 5 8 12l7 7"'); expect(h).toContain('data-testid="wl-close"') // та же стрелка и тот же data-testid, что у крестика
    expect(h).toContain('aria-label="Пауза"'); expect(h).toContain('data-testid="race-pause"'); expect(h.indexOf('raceBack')).toBeLessThan(h.indexOf('racePause'))
    expect(h).not.toContain('lucide-x')
  })
  it('на паузе кнопка — «плей» с подписью «Продолжить»', () => {
    const h = html({ paused: true }); expect(h).toContain('aria-label="Продолжить"'); expect(h).not.toContain('aria-label="Пауза"')
  })
  it('игра: у гонки панель вместо крестика, паузу ставит f.pause, снимает pause.resume; корень помечен data-race; без гонки крестик на месте', () => {
    const g = read('../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(g).toContain("<RacePanel onBack={f.finish} onPause={() => f.pause('button')} onResume={pause.resume} paused={f.paused} />")
    expect(g).toContain('<button type="button" className="wlClose" onClick={f.finish} aria-label="Закрыть" data-testid="wl-close">'); expect(g).toContain("data-race={race ? '' : undefined}")
    expect(read('../../shared/ui/BackButton.jsx')).toContain('{...rest}')
  })
  it('CSS: кнопки 36 px на линии safe-area + 10 px (центр safe + 28 px), бар между ними; ⚙ и 💬 — строкой ниже, справа, мельче (28 px)', () => {
    expect(rule(css, '.wl .raceBack')).toMatch(/top: var\(--wl-top\)/); expect(rule(css, '.racePause')).toMatch(/top: var\(--wl-top\)/); expect(read('../../styles/player/modules/word-lane.css')).toMatch(/--wl-top: calc\(env\(safe-area-inset-top, 0px\) \+ 10px\)/); expect(read('../../styles/player/modules/word-lane.css')).toMatch(/\.wlLanes \{ inset: var\(--wl-top\) 0 0;/) // верх кнопок = верх дорожек и разделителей (--wl-top) expect(rule(css, '.wl .raceBack')).toMatch(/left: calc\(env\(safe-area-inset-left, 0px\) \+ 10px\)/)
    expect(rule(css, '.racePause')).toMatch(/right: calc\(env\(safe-area-inset-right, 0px\) \+ 10px\)/); expect(rule(css, '.racePause')).toMatch(/width: 36px/)
    const admin = rule(css, '.wl[data-race] .wlHudBtn, .wl[data-race] .wlCmtBtn')
    expect(admin).toMatch(/top: calc\(env\(safe-area-inset-top, 0px\) \+ 54px\)/); expect(admin).toMatch(/width: 28px/) // ниже кнопок панели (10 + 36 = 46)
    expect(rule(css, '.wl[data-race] .wlHudBtn')).toMatch(/right: calc\(env\(safe-area-inset-right, 0px\) \+ 10px\)/)
    expect(rule(css, '.wl[data-race] .wlCmtBtn')).toMatch(/right: calc\(env\(safe-area-inset-right, 0px\) \+ 44px\)/); expect(css).not.toMatch(/\bfilter:/)
    expect(rule(css, '.wl[data-race] .wlXp')).toMatch(/top: calc\(env\(safe-area-inset-top, 0px\) \+ 54px\)/); expect(rule(css, '.wl[data-race] .wlXp')).toMatch(/right: auto;/) // счётчик XP не лежит под кнопкой «пауза»
  })
})

describe('затемнение сверху и снизу сцены гонки', () => {
  it('площадь вдвое меньше (7 % и 14 % плюс safe-area), градиент от края устройства: у края 0,9, к сцене плавно (smoothstep) до 0 без ступеньки; только у гонки', () => {
    const top = rule(bg, '.wl[data-race] .wlFade--top'), bottom = rule(bg, '.wl[data-race] .wlFade--bottom')
    expect(top).toMatch(/height: calc\(7% \+ env\(safe-area-inset-top, 0px\)\)/); expect(bottom).toMatch(/height: calc\(14% \+ env\(safe-area-inset-bottom, 0px\)\)/)
    const alphas = r => [...r.matchAll(/rgba\(14, 17, 22, ([0-9.]+)\) (\d+)%/g)].map(m => [+m[1], +m[2]])
    for (const [r, dir] of [[top, 'to bottom'], [bottom, 'to top']]) { // v3.3.216: растушёвка — 11 остановок, кривая smoothstep от 0,9 у края до 0 (раньше линейно до 0,1 — видимая кромка)
      const a = alphas(r); expect(r).toContain(`linear-gradient(${dir}, `); expect(a).toHaveLength(11)
      expect(a[0]).toEqual([0.9, 0]); expect(a.at(-1)).toEqual([0, 100]); expect(a.some(([v]) => v === 0.1)).toBe(false)
      expect(a.every(([v], i) => i === 0 || v <= a[i - 1][0])).toBe(true) // монотонно спадает
      expect(a[1][0] - a[0][0]).toBeGreaterThan(-0.05); expect(a.at(-2)[0]).toBeLessThan(0.05) // плавный вход и выход: у границ почти нет излома
    }
    expect(bg).not.toMatch(/\bfilter:/)
    const base = read('../../styles/player/modules/word-lane.css')
    expect(base).toContain('.wlFade--top { top: 0; height: 14%;'); expect(base).toContain('.wlFade--bottom { bottom: 0; height: 28%;') // обычные игры не затронуты
  })
  it('узор фона тусклее на 20 %: 0,04 вместо 0,05', () => {
    expect(rule(bg, '.wlStage[data-tex]::before')).toMatch(/opacity: 0\.04;/)
  })
})
