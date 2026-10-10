import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка СОСТОЯНИЙ круга-микрофона «Сказать фразу» (locked / ready / active / done / off): таблица значений в say-phrase-state.css, пружина и плавная заливка записи, покой без пульса,
// передача состояния из панели в SayStage. Остальной CSS — sayPhraseCssWiring.test.js; чистая логика состояния — sayMicState.test.js
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))
const micCss = read('../../../../styles/player/panels/say-phrase-mic.css')
const stateCss = read('../../../../styles/player/panels/say-phrase-state.css')
const ringCss = read('../../../../styles/player/panels/say-phrase-ring.css')
const strip = c => c.replace(/\/\*[\s\S]*?\*\//g, '')

describe('say_phrase — состояния круга', () => {
  it('состояния круга (locked / ready / active / done / off): масштаб 0,85 / 1 / 1,15 / 1 / 0,85, цвета переменными; серый без доступа, тёмный круг с зелёной иконкой при доступе, лайм-заливка с тёмной иконкой в записи', () => {
    const code = strip(stateCss)
    const rule = name => code.match(new RegExp(`\\.sayMicBox--${name} \\{[^}]*\\}`))[0]
    expect(rule('locked')).toMatch(/--mic-scale: \.85;[^}]*--mic-bg: var\(--say-gray\)[^}]*--mic-ink: var\(--say-gray-ink\)/)
    expect(rule('ready')).toMatch(/--mic-scale: 1;[^}]*--mic-bg: var\(--say-dark\)[^}]*--mic-ink: var\(--say-lime\)/)
    expect(rule('active')).toMatch(/--mic-scale: 1\.15;[^}]*--mic-bg: var\(--say-lime\)[^}]*--mic-ink: var\(--say-ink\)/)
    expect(rule('done')).toMatch(/--mic-scale: 1;[^}]*--mic-bg: var\(--say-lime\)[^}]*--mic-ink: var\(--say-ink\)/)
    expect(rule('off')).toMatch(/--mic-scale: \.85;[^}]*--mic-bg: var\(--say-gray\)/)
    // без доступа — серый трек и ЧУТЬ светлее серая бегущая дуга; с доступом (покой) — сплошное зелёное кольцо, дуги и трека нет; в записи зелёное кольцо НЕ исчезает (приглушено); на «Готово» полностью
    expect(rule('locked')).toMatch(/--ring-track: #6b7180;[^}]*--ring-arc: #c4c9d6;[^}]*--ring-full-o: 0/)
    expect(rule('ready')).toMatch(/--ring-track-o: 0;[^}]*--ring-arc-o: 0;[^}]*--ring-full-o: 1/)
    const act = Number(rule('active').match(/--ring-full-o: ([\d.]+)/)[1])
    expect(act).toBeGreaterThanOrEqual(0.4)
    expect(act).toBeLessThan(1)
    expect(rule('active')).toMatch(/--ring-track-o: 0;[^}]*--ring-arc-o: 0/)
    expect(rule('done')).toMatch(/--ring-full-o: 1/)
    expect(rule('off')).toMatch(/--ring-arc-o: 0;[^}]*--ring-full-o: 0/)
    expect(strip(micCss)).toMatch(/\.sayPanel \{ --say-dark: #12141d; --say-gray: #2f333d; --say-gray-ink: #8a90a2; \}/)
  })

  it('размер круга и кольца: ПЛАВНО в обе стороны одной кривой --size-t (в запись — мягкий ease-out с едва заметным перелётом ≈0,55 с, из записи — ease-in-out ≈0,5 с); нажатие — отдельное свойство scale, не transform', () => {
    const code = strip(stateCss)
    const mic = strip(micCss)
    const ring = strip(ringCss)
    const secs = v => Number(v.match(/([\d.]+)s/)[1])
    // из записи и все остальные переходы (0,85 → 1, в «Готово»): ease-in-out ≈0,5 с, без перелёта
    const out = code.match(/\.sayPanel \{ --size-t: ([\d.]+s) cubic-bezier\(([^)]*)\); \}/)
    expect(secs(out[1])).toBeGreaterThanOrEqual(0.45)
    expect(secs(out[1])).toBeLessThanOrEqual(0.55)
    const [ox1, oy1, ox2, oy2] = out[2].split(',').map(Number)
    expect(oy1).toBe(0)                       // ease-in: старт плавный (нет рывка вниз сразу после конца записи)
    expect(oy2).toBe(1)                       // и без перелёта ниже 1,0
    expect(ox1).toBeGreaterThan(0)
    expect(ox2).toBeLessThan(1)
    // в запись: мягкий ease-out ≈0,5–0,6 с, перелёт едва заметный (y2 чуть выше 1, но не пружина)
    const inn = code.match(/\.sayMicBox--active \{[^}]*--size-t: ([\d.]+s) cubic-bezier\(([^)]*)\);/)
    expect(secs(inn[1])).toBeGreaterThanOrEqual(0.5)
    expect(secs(inn[1])).toBeLessThanOrEqual(0.6)
    const [ix1, iy1, , iy2] = inn[2].split(',').map(Number)
    expect(iy1).toBeGreaterThan(ix1)          // ease-out: старт быстрее линейного
    expect(iy2).toBeGreaterThan(1)            // едва заметный перелёт …
    expect(iy2).toBeLessThanOrEqual(1.1)      // … не пружина
    expect(code).not.toMatch(/linear\(0, /)   // пружины linear() больше нет
    // круг и кольцо читают ОДНУ переменную; transition берётся из состояния-приёмника, поэтому смена класса не сбрасывает размер
    expect(mic.match(/\.sayPanel \.sayMicBtn \{[^}]*\}/)[0]).toMatch(/transition: transform var\(--size-t\), scale \.12s ease-out, background \.32s, border-color \.32s, color \.32s/)
    expect(code).toMatch(/\.sayMicBox--active \.sayMicBtn \{\s*transition: transform var\(--size-t\), scale \.12s ease-out, background 0s, border-color \.2s, color 0s/)
    expect(ring.match(/\.sayRing \{[^}]*\}/)[0]).toMatch(/transition: transform var\(--size-t/)
    // нажатие не трогает transform и не отключает transition (на iPhone :active и клик идут впритык и обрывали бы размер)
    expect(mic).toMatch(/\.sayPanel \.sayMicBtn:active:not\(:disabled\) \{ scale: \.95; \}/)
    expect(mic).not.toMatch(/:active[^{]*\{[^}]*(transition: none|transform:)/)
    expect(mic).toMatch(/\.sayPanel \.sayMicBtn--done:disabled, \.sayPanel \.sayMicBtn--off:disabled \{ opacity: 1; \}/)
    // prefers-reduced-motion: размер меняется за .2 с, без «роста»
    expect(code).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.sayPanel, \.sayPanel \.sayMicBox--active \{ --size-t: \.2s ease-out; \}/)
  })

  it('заливка при нажатии идёт КОЛЬЦОМ от края круга к центру: диск прежнего цвета (::before) сжимается scale(1 → 0) ≈0,6–0,7 с, ease-out, лайм приходит от края; значок темнеет синхронно; без @property и mask', () => {
    const code = strip(stateCss)
    const fill = code.match(/--say-fill-t: ([\d.]+)s; --say-fill: var\(--say-fill-t\) (cubic-bezier\([^)]*\))/)
    expect(Number(fill[1])).toBeGreaterThanOrEqual(0.6)
    expect(Number(fill[1])).toBeLessThanOrEqual(0.7)
    const [x1, y1, x2, y2] = fill[2].match(/[\d.]+/g).map(Number)
    expect(y1).toBeGreaterThan(x1)  // ease-out: старт быстрее линейного …
    expect(y2).toBe(1)              // … и плавно оседает в цель без перелёта
    expect(x2).toBeLessThan(1)
    expect(code).toMatch(/\.sayMicBox--active \.sayMicBtn::before \{ animation: sayIris var\(--say-fill\) both; \}/)
    expect(code).toMatch(/@keyframes sayIris \{\s*from \{ transform: scale\(1\); \}\s*to\s+\{ transform: scale\(0\); \}/)
    // диск: в покое сжат в точку; цвет «прежнего» круга — тёмный (из ready) или серый (из locked, класс --from-locked)
    const disc = strip(micCss).match(/\.sayPanel \.sayMicBtn::before \{[^}]*\}/)[0]
    expect(disc).toMatch(/border-radius: 50%/)
    expect(disc).toMatch(/background: var\(--from-bg, var\(--say-dark\)\)/)
    expect(disc).toMatch(/transform: scale\(0\)/)
    expect(code).toMatch(/\.sayMicBox--from-locked \{ --from-bg: var\(--say-gray\); --from-ink: var\(--say-gray-ink\); \}/)
    expect(code + strip(micCss)).not.toMatch(/@property|mask|conic-gradient/) // надёжно в Safari 16+
    // SayStage ставит --from-locked, когда в запись пришли из серого круга
    expect(panelSrc['SayStage.jsx']).toContain("from === 'locked' ? ' sayMicBox--from-locked' : ''")
    // prefers-reduced-motion: без заливки кольцом (диск скрыт, анимации значка нет), смена цвета за .2 с
    expect(strip(micCss)).toMatch(/\.sayPanel \.sayMicBtn::before \{ display: none; \}/)
    expect(code).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*\.sayMicBox--active \.sayMicBtn \{ transition: transform var\(--size-t\), background \.2s, border-color \.2s, color \.2s, opacity \.2s; \}[^}]*\n\s*\.sayMicBox--active \.sayFaceMic \{ animation: none; \}/)
  })

  it('значок при заливке: схлопывается до нуля (ease-in) в первой половине заливки, при нуле меняет цвет на тёмный, после заливки возвращается 0 → 1 с лёгким перелётом ≈0,3 с — только transform и цвет', () => {
    const code = strip(stateCss)
    expect(code).toMatch(/\.sayMicBox--active \.sayFaceMic \{ animation: sayIconPop var\(--say-icon-t\) linear both; \}/)
    const total = Number(code.match(/--say-icon-t: ([\d.]+)s/)[1])
    const fill = Number(code.match(/--say-fill-t: ([\d.]+)s/)[1])
    const kf = code.match(/@keyframes sayIconPop \{([\s\S]*?)\n\}/)[1]
    const frame = pct => kf.match(new RegExp(`\\n\\s*${pct}%\\s*\\{([^}]*)\\}`, 'm') ) ?? kf.match(new RegExp(`${pct}%\\s*\\{([^}]*)\\}`))
    const at = pct => frame(pct)[1]
    // 0%: размер 1, прежний цвет, кривая ease-in до нуля
    expect(at(0)).toMatch(/transform: scale\(1\);[^;]*--from-ink[^;]*;\s*animation-timing-function: cubic-bezier\(\.5, 0, \.75, 0\)/)
    // ноль достигается в первой половине заливки; цвет меняется, пока значок нулевой
    const zeroAt = 0.34 * total
    expect(zeroAt).toBeLessThanOrEqual(fill / 2 + 0.01)
    expect(at(34)).toMatch(/transform: scale\(0\);[^;]*--from-ink/)
    expect(at(35)).toMatch(/transform: scale\(0\);\s*color: var\(--say-ink\)/)
    // держится нулевым до конца заливки (69% от общего времени ≈ --say-fill-t) и возвращается с перелётом (y1 > 1) за 0,25–0,35 с
    expect(Math.abs(0.69 * total - fill)).toBeLessThan(0.02)
    expect(at(69)).toMatch(/transform: scale\(0\);\s*color: var\(--say-ink\);\s*animation-timing-function: cubic-bezier\(\.34, 1\.45, \.64, 1\)/)
    expect(at(100)).toMatch(/transform: scale\(1\);\s*color: var\(--say-ink\)/)
    const back = (1 - 0.69) * total
    expect(back).toBeGreaterThanOrEqual(0.25)
    expect(back).toBeLessThanOrEqual(0.35)
    expect(kf).not.toMatch(/opacity|filter|background|@property/) // только transform и цвет
    expect(code).not.toContain('sayIconInk')
  })

  it('в покое ничего не движется: пульса круга нет (ни обёртки .sayMicPulse, ни keyframes), кнопка лежит прямо в .sayMicBox; дуга кольца бежит только в locked', () => {
    const all = strip(stateCss + micCss + ringCss)
    expect(all).not.toMatch(/sayMicPulse|sayBtnPulse/)
    expect(panelSrc['SayStage.jsx']).not.toContain('sayMicPulse')
    expect(panelSrc['SayStage.jsx']).toMatch(/<SayRing \/>\s*<button/)
    const ring = strip(ringCss)
    expect(ring).toMatch(/\.sayRingSpin \{[^}]*animation: sayRingSpin 9s linear infinite paused;/) // по умолчанию стоит
    expect(ring).toMatch(/\.sayMicBox--locked \.sayRingSpin \{ animation-play-state: running; \}/)    // бежит только без доступа
    expect((ring.match(/animation-play-state: running/g) ?? []).length).toBe(1)
  })

  it('состояние круга: панель считает micVisualState({ ...sp.access, phase }) и передаёт в SayStage (класс на корне, aria-label по состоянию); хук отдаёт access из perm.access() и перерисовывается после ответа query', () => {
    const body = panelSrc['SayPhrasePanel.jsx']
    const hook = panelSrc['useSayPhrase.js']
    const stage = panelSrc['SayStage.jsx']
    expect(body).toContain('micVisualState({ ...sp.access, phase })')
    expect(body).toContain('useDelayedMicState(micTarget, { settled: sp.perm.isChecked() })') // картинка запаздывает, решения идут по настоящему micTarget
    expect(body).toContain("locked: micState === 'locked'")
    expect(body).toContain('state={micState}')
    expect(hook).toContain('access: perm.access()')
    expect(hook).toContain('onRefreshed: bumpAccess')
    expect(hook).toContain('.then(bumpAccess)')
    expect(stage).toContain('MIC_ALLOW_ARIA')
    expect(stage).toContain("state === 'locked' ? MIC_ALLOW_ARIA : label")
    expect(stage).toContain('data-state={state}')
    // логика движков не тронута: решение по тапу, begin и confirmExplain как были
    expect(hook).toMatch(/const confirmExplain = useCallback\(\(\) => \{ perm\.markExplained\(\); perm\.markIntroSeen\(\); perm\.markPreShown\(\); begin\(\) \}/)
    expect(hook).toContain('planTap({ view: s.view, decision: perm.decide()')
  })
})
