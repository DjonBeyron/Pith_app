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
  it('состояния круга (locked / ready / active / done / off): масштаб круга 0,765 / 1 / 1,15 / 1 / 0,765 (locked и off — на 10 % меньше прежних 0,85), кольцо в них ×0,9, цвета переменными; серый без доступа, тёмный круг с зелёной иконкой при доступе, лайм-заливка с тёмной иконкой в записи', () => {
    const code = strip(stateCss)
    const rule = name => code.match(new RegExp(`\\.sayMicBox--${name} \\{[^}]*\\}`))[0]
    expect(rule('locked')).toMatch(/--mic-scale: \.765;[^}]*--mic-bg: var\(--say-gray\)[^}]*--mic-ink: var\(--say-gray-ink\)/)
    expect(rule('ready')).toMatch(/--mic-scale: 1;[^}]*--mic-bg: var\(--say-dark\)[^}]*--mic-ink: var\(--say-lime\)/)
    expect(rule('active')).toMatch(/--mic-scale: 1\.15;[^}]*--mic-bg: var\(--say-lime\)[^}]*--mic-ink: var\(--say-ink\)/)
    expect(rule('done')).toMatch(/--mic-scale: 1;[^}]*--mic-bg: var\(--say-lime\)[^}]*--mic-ink: var\(--say-ink\)/)
    expect(rule('off')).toMatch(/--mic-scale: \.765;[^}]*--mic-bg: var\(--say-gray\)/)
    for (const n of ['locked', 'off']) expect(rule(n)).toMatch(/--ring-scale: \.9;/) // круг + кольцо + иконка (внутри круга) ещё на 10 % меньше: .85 × .9 = .765, кольцо 1 × .9
    for (const n of ['ready', 'done']) expect(rule(n)).toMatch(/--ring-scale: 1;/)
    expect(rule('active')).toMatch(/--ring-scale: 1\.15;/)
    // без доступа — серый трек и ЧУТЬ светлее серая бегущая дуга; с доступом (покой) — сплошное зелёное кольцо, дуги и трека нет; в записи зелёное кольцо НЕ исчезает (приглушено); на «Готово» полностью
    expect(rule('locked')).toMatch(/--ring-track: #6b7180;[^}]*--ring-arc: #c4c9d6;[^}]*--ring-full-o: 0/)
    expect(rule('ready')).toMatch(/--ring-track-o: 0;[^}]*--ring-arc-o: 0;[^}]*--ring-full-o: 1/)
    const act = Number(rule('active').match(/--ring-full-o: ([\d.]+)/)[1])
    expect(act).toBeGreaterThanOrEqual(0.4)
    expect(act).toBeLessThan(1)
    expect(rule('active')).toMatch(/--ring-track-o: 0;[^}]*--ring-arc-o: 0/)
    expect(rule('done')).toMatch(/--ring-full-o: 1/)
    expect(rule('off')).toMatch(/--ring-arc-o: 0;[^}]*--ring-full-o: 0/)
    expect(rule('ready')).toMatch(/--mic-rim: #[0-9a-f]{6};/) // ободок ready непрозрачный: полупрозрачный в первом кадре заливки вспыхивал бы над лаймовым фоном кнопки
    expect(strip(micCss)).toMatch(/\.sayPanel \{ --say-dark: #12141d; --say-gray: #2f333d; --say-gray-ink: #8a90a2; \}/)
  })

  it('размер круга и кольца: ПЛАВНО в обе стороны одной кривой --size-t (в запись — --size-in: та же длительность и кривая, что у заливки, ease-in-out с нулевой начальной скоростью, без перелёта; из записи — ease-in-out ≈0,5 с); нажатие — отдельное свойство scale, не transform', () => {
    const code = strip(stateCss)
    const mic = strip(micCss)
    const ring = strip(ringCss)
    const secs = v => Number(v.match(/([\d.]+)s/)[1])
    // из записи и все остальные переходы (0,85 → 1, в «Готово»): ease-in-out ≈0,5 с, без перелёта
    const out = code.match(/\.sayPanel \{ --size-t: ([\d.]+s) cubic-bezier\(([^)]*)\); --size-in: var\(--say-fill-t\) var\(--say-ease\); \}/)
    expect(secs(out[1])).toBeGreaterThanOrEqual(0.45)
    expect(secs(out[1])).toBeLessThanOrEqual(0.55)
    const [ox1, oy1, ox2, oy2] = out[2].split(',').map(Number)
    expect(oy1).toBe(0)                       // ease-in: старт плавный (нет рывка вниз сразу после конца записи)
    expect(oy2).toBe(1)                       // и без перелёта ниже 1,0
    expect(ox1).toBeGreaterThan(0)
    expect(ox2).toBeLessThan(1)
    // в запись: рост и заливка — ОДНА длительность и кривая (--size-in = --say-fill-t + --say-ease): синхронно, без перелёта, старт с нулевой скоростью
    expect(code).toMatch(/\.sayMicBox--active \{[^}]*--size-t: var\(--size-in\);/)
    const ease = code.match(/--say-ease: cubic-bezier\(([^)]*)\); --say-fill-t: ([\d.]+)s; --say-fill: var\(--say-fill-t\) var\(--say-ease\);/)
    const [ex1, ey1, ex2, ey2] = ease[1].split(',').map(Number)
    expect(ey1).toBe(0)                        // нулевая начальная скорость: первые кадры без рывка
    expect(ey2).toBe(1)                        // без перелёта
    expect(ex1).toBeGreaterThan(0.2)
    expect(ex2).toBeLessThan(1)
    expect(Number(ease[2])).toBeGreaterThanOrEqual(0.75)
    expect(Number(ease[2])).toBeLessThanOrEqual(0.9)
    expect(code).not.toMatch(/linear\(0, /)   // пружины linear() больше нет
    // круг и кольцо читают ОДНУ переменную; transition берётся из состояния-приёмника, поэтому смена класса не сбрасывает размер
    expect(mic.match(/\.sayPanel \.sayMicBtn \{[^}]*\}/)[0]).toMatch(/transition: transform var\(--size-t\), scale \.12s ease-out, background \.32s, border-color \.32s, color \.32s/)
    expect(code).toMatch(/\.sayMicBox--active \.sayMicBtn \{\s*transition: transform var\(--size-t\), scale \.12s ease-out, background 0s, border-color \.4s, color 0s/)
    expect(ring.match(/\.sayRing \{[^}]*\}/)[0]).toMatch(/transition: transform var\(--size-t/)
    // нажатие не трогает transform и не отключает transition (на iPhone :active и клик идут впритык и обрывали бы размер)
    expect(mic).toMatch(/\.sayPanel \.sayMicBtn:active:not\(:disabled\) \{ scale: \.95; \}/)
    expect(mic).not.toMatch(/:active[^{]*\{[^}]*(transition: none|transform:)/)
    expect(mic).toMatch(/\.sayPanel \.sayMicBtn--done:disabled, \.sayPanel \.sayMicBtn--off:disabled \{ opacity: 1; \}/)
    // prefers-reduced-motion: размер меняется за .2 с, без «роста» (и якорь волн — через --size-in)
    expect(code).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.sayPanel \{ --size-in: \.2s ease-out; \}\s*\.sayPanel, \.sayPanel \.sayMicBox--active \{ --size-t: \.2s ease-out; \}/)
  })

  it('заливка при нажатии идёт КОЛЬЦОМ от края круга к центру: диск прежнего цвета (::before) сжимается scale(1 → 0) 0,75–0,9 с, ease-in-out (мягкий старт), лайм приходит от края; слои на GPU только в active; без @property и mask', () => {
    const code = strip(stateCss)
    const fill = code.match(/--say-ease: cubic-bezier\(([^)]*)\); --say-fill-t: ([\d.]+)s/)
    expect(Number(fill[2])).toBeGreaterThanOrEqual(0.75)
    expect(Number(fill[2])).toBeLessThanOrEqual(0.9)
    const [x1, y1, x2, y2] = fill[1].match(/[\d.]+/g).map(Number)
    expect(y1).toBe(0)              // нулевая начальная скорость: за первые 50 мс заливка ≤ 1,5 % пути (прежняя ease-out давала 12 %) — и это убирает «дёрганый» старт
    expect(x1).toBeGreaterThan(0.2)
    expect(y2).toBe(1)              // плавно оседает в цель без перелёта
    expect(x2).toBeLessThan(1)
    expect(code).toMatch(/\.sayMicBox--active \.sayMicBtn::before \{ animation: sayIris var\(--say-fill\) both; will-change: transform; \}/)
    expect(code).toMatch(/@keyframes sayIris \{\s*from \{ transform: scale\(1\); \}\s*to\s+\{ transform: scale\(0\); \}/)
    for (const [, sel, decl] of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (/will-change/.test(decl)) expect(sel, 'will-change только в записи').toContain('.sayMicBox--active') // GPU-слой без постоянной нагрузки
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

  it('значок при заливке: схлопывается до нуля (ease-in-out) к моменту, когда заливка доходит до его краёв, при нуле меняет цвет на тёмный, после заливки возвращается 0 → 1 с лёгким перелётом ≈0,3 с — только transform и цвет', () => {
    const code = strip(stateCss)
    expect(code).toMatch(/\.sayMicBox--active \.sayFaceMic \{ animation: sayIconPop var\(--say-icon-t\) linear both; will-change: transform; \}/)
    const total = Number(code.match(/--say-icon-t: ([\d.]+)s/)[1])
    const fill = Number(code.match(/--say-fill-t: ([\d.]+)s/)[1])
    const kf = code.match(/@keyframes sayIconPop \{([\s\S]*?)\n\}/)[1]
    const at = pct => kf.match(new RegExp(`${pct}%\\s*\\{([^}]*)\\}`))[1]
    // 0%: размер 1, прежний цвет, кривая ease-in-out до нуля (без «щелчка» в конце: скорость в нуле нулевая)
    expect(at(0)).toMatch(/transform: scale\(1\);[^;]*--from-ink[^;]*;\s*animation-timing-function: cubic-bezier\(\.45, 0, \.55, 1\)/)
    // ноль достигается ДО того, как лайм доходит до края значка: заливка там ≈ 45 % пути (≈ 0,40 с при 0,85 с), значок — к ≈ 0,38 с; цвет меняется, пока значок нулевой
    const zeroAt = 0.33 * total
    expect(zeroAt).toBeLessThanOrEqual(0.4)
    expect(zeroAt).toBeLessThan(fill / 2)
    expect(at(33)).toMatch(/transform: scale\(0\);[^;]*--from-ink/)
    expect(at(34)).toMatch(/transform: scale\(0\);\s*color: var\(--say-ink\)/)
    // держится нулевым до конца заливки (74% от общего времени ≈ --say-fill-t) и возвращается с перелётом (y1 > 1) за 0,25–0,35 с
    expect(Math.abs(0.74 * total - fill)).toBeLessThan(0.02)
    expect(at(74)).toMatch(/transform: scale\(0\);\s*color: var\(--say-ink\);\s*animation-timing-function: cubic-bezier\(\.34, 1\.45, \.64, 1\)/)
    expect(at(100)).toMatch(/transform: scale\(1\);\s*color: var\(--say-ink\)/)
    const back = (1 - 0.74) * total
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
    expect(body).toContain('useDelayedMicState(micTarget, { settled: sp.perm.isChecked(), noAccess') // картинка запаздывает, решения идут по настоящему micTarget
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
