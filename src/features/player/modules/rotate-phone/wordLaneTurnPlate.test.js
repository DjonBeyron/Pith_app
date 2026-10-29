import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

// Плашка «Теперь твоя очередь» / названия раундов: выходит с «колебанием» окон приложения (popSheetWobble) и со звуком (короткий тихий блюп, ≤ 150 мс), в lite и reduced-motion — без колебания, звук остаётся
const fx = vi.hoisted(() => ({ effects: [], weak: false, plays: 0, muted: false, silenced: false }))
vi.mock('react', async orig => ({ ...(await orig()), useEffect: fn => { fx.effects.push(fn) }, useMemo: fn => fn() }))
vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => fx.weak }))
vi.mock('./wordLanePlateSound.js', async orig => ({ ...(await orig()), playPlate: () => { fx.plays++; return true } }))
const { default: WordLaneTurnPlate } = await import('./WordLaneTurnPlate.jsx')

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const lines = rel => read(rel).split('\n').length
beforeEach(() => { fx.effects.length = 0; fx.weak = false; fx.plays = 0 })
afterEach(() => { vi.restoreAllMocks() })

describe('плашка: разметка и звук при появлении', () => {
  it('разметка: .wlTurn с текстом и длиной показа в --wl-turn-ms (а не inline animation-duration, который перебил бы анимацию появления)', () => {
    const html = renderToStaticMarkup(createElement(WordLaneTurnPlate, { text: 'Теперь твоя очередь', ms: 2400 }))
    expect(html).toContain('class="wlTurn"')
    expect(html).toContain('data-testid="wl-turn"')
    expect(html).toContain('Теперь твоя очередь')
    expect(html).toContain('--wl-turn-ms:2400ms')
    expect(html).not.toContain('animation-duration')
  })
  it('lite (слабое устройство): класс wlTurn--lite — без колебания', () => {
    fx.weak = true
    expect(renderToStaticMarkup(createElement(WordLaneTurnPlate, { text: 'x', ms: 1000 }))).toContain('class="wlTurn wlTurn--lite"')
  })
  it('звук играет при монтировании — ровно один раз, в lite тоже', () => {
    renderToStaticMarkup(createElement(WordLaneTurnPlate, { text: 'x', ms: 1000 }))
    expect(fx.effects).toHaveLength(1)
    fx.effects[0]()
    expect(fx.plays).toBe(1)
    fx.weak = true
    fx.effects.length = 0
    renderToStaticMarkup(createElement(WordLaneTurnPlate, { text: 'x', ms: 1000 }))
    fx.effects[0]()
    expect(fx.plays).toBe(2)
  })
  it('эффект без зависимостей-пересрабатывания: пустой список зависимостей (только при монтировании), игра ставит key = номер шага', () => {
    expect(read('./WordLaneTurnPlate.jsx')).toContain('useEffect(() => { playPlate() }, [])')
    const game = read('./WordLaneGame.jsx')
    expect(game).toContain('{f.plate && <WordLaneTurnPlate key={f.idx} text={f.plate} ms={f.plateMs} />}')
    expect(game).toContain("import WordLaneTurnPlate from './WordLaneTurnPlate.jsx'")
    expect(game).not.toContain('className="wlTurn"')
  })
})

describe('CSS: «колебание» как у окон приложения', () => {
  const css = read('../../../../styles/player/modules/word-lane-mic.css')
  const pop = read('../../../../styles/pop-spring.css')
  const WOBBLE = 'cubic-bezier(0.34, 1.25, 0.64, 1)'
  it('кривая та же, что у popSheetWobble (pop-spring.css): рост из нуля от середины с перелётом', () => {
    expect(pop).toMatch(/@keyframes popSheetWobble \{\s*from \{ transform: scale\(0\)/)
    expect(pop).toContain(`animation: popSheetWobble 0.3s ${WOBBLE} backwards`)
    expect(css).toMatch(new RegExp(`\\.wlTurn \\{[^}]*animation: wlTurnIn 0\\.3s ${WOBBLE.replace(/[()]/g, '\\$&')} backwards`))
    expect(css).toMatch(/@keyframes wlTurnIn \{\s*from \{ scale: 0; \}\s*to\s*\{ scale: 1; \}/)
    expect(css).toMatch(/\.wlTurn \{[^}]*\n {2}top: 50%;[^}]*transform: translate\(-50%, -50%\)/)   // центр плашки — центр роста (transform-origin по умолчанию 50 % 50 %)
    expect(css).not.toMatch(/\.wlTurn \{[^}]*transform-origin/)
  })
  it('рост — свойство scale, уход — transform + opacity на всю длину показа (--wl-turn-ms): анимации на разных свойствах не перебивают друг друга', () => {
    expect(css).toContain('wlTurnOut var(--wl-turn-ms, 2.2s) ease-in both')
    const inK = css.slice(css.indexOf('@keyframes wlTurnIn'), css.indexOf('@keyframes wlTurnOut'))
    expect(inK).not.toMatch(/opacity|transform/)
    const outK = css.slice(css.indexOf('@keyframes wlTurnOut'), css.indexOf('.wlTurn--lite'))
    expect(outK).toMatch(/0%, 82% \{ opacity: 1;/)
    expect(outK).toMatch(/100%\s*\{ opacity: 0; transform: translate\(-50%, -50%\) scale\(0\.95\)/)
    expect(outK).not.toMatch(/scale: /)
  })
  it('lite и reduced-motion: без колебания — только проявление и уход (wlTurnFade), без wlTurnIn', () => {
    expect(css).toMatch(/\.wlTurn--lite \{ animation: wlTurnFade var\(--wl-turn-ms, 2\.2s\) ease both; \}/)
    const fade = css.slice(css.indexOf('@keyframes wlTurnFade'), css.indexOf('/* Микрофон'))
    expect(fade).toMatch(/0%\s*\{ opacity: 0; \}/)
    expect(fade).toMatch(/11%, 82% \{ opacity: 1; \}/)
    expect(fade).toMatch(/100% \{ opacity: 0; \}/)
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(rm).toMatch(/\.wlTurn \{ animation: wlTurnFade var\(--wl-turn-ms, 2\.2s\) ease both; \}/)
    expect(rm).not.toMatch(/\.wlTurn[^{]*\{[^}]*0\.01s/)                                            // раньше 0,01 с с fill both обнуляло плашку до того, как её увидят
  })
})

describe('размеры файлов', () => {
  it('новые файлы ≤ 250 строк', () => {
    for (const f of ['./WordLaneTurnPlate.jsx', './wordLanePlateSound.js', './wordLaneTurnPlate.test.js', './wordLanePlateSound.test.js']) expect(lines(f)).toBeLessThanOrEqual(250)
  })
})
