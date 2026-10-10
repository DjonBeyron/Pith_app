import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка СОСТОЯНИЙ круга-микрофона «Сказать фразу» (locked / ready / active / done / off): таблица значений в say-phrase-state.css, пружина записи, пульс «доступ выдан»,
// передача состояния из панели в SayStage. Остальной CSS — sayPhraseCssWiring.test.js; чистая логика состояния — sayMicState.test.js
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))
const micCss = read('../../../../styles/player/panels/say-phrase-mic.css')
const stateCss = read('../../../../styles/player/panels/say-phrase-state.css')
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
    // дуга без доступа — серая и ЧУТЬ светлее серого трека; с доступом трек и дуга зелёные; в записи кольцо гаснет
    expect(rule('locked')).toMatch(/--ring-track: #6b7180;[^}]*--ring-arc: #c4c9d6/)
    expect(rule('ready')).toMatch(/--ring-track: var\(--say-lime\);[^}]*--ring-arc: var\(--say-lime\)/)
    expect(rule('active')).toMatch(/--ring-track-o: 0;[^}]*--ring-arc-o: 0/)
    expect(strip(micCss)).toMatch(/\.sayPanel \{ --say-dark: #12141d; --say-gray: #2f333d; --say-gray-ink: #8a90a2; \}/)
  })

  it('запись: круг растёт ПРУЖИНОЙ с перелётом (linear() и запасной cubic-bezier для Safari 16), заливка и цвет значка меняются плавно; нажатие — без перехода; возврат — обычный ease без пружины', () => {
    const code = strip(stateCss)
    expect(code).toMatch(/\.sayMicBox--active \.sayMicBtn \{\s*transition: transform \.6s cubic-bezier\(\.34, 1\.8, \.55, 1\), background \.32s, border-color \.32s, color \.32s/)
    const sup = code.match(/@supports \(transition-timing-function: linear\(0, 1\)\) \{[\s\S]*?\n\}/)[0]
    const pts = sup.match(/linear\(([^)]*)\)\s*,\s*background/)[1].split(',').map(Number)
    expect(Math.max(...pts)).toBeGreaterThan(1.1)   // перелёт ≈ 16%
    expect(Math.max(...pts)).toBeLessThan(1.3)
    expect(pts[0]).toBe(0)
    expect(pts[pts.length - 1]).toBe(1)             // пружина оседает точно в цель
    expect(pts.slice(8).some(v => v < 1)).toBe(true) // и успевает «недолететь» после первого перелёта (колебание)
    expect(strip(micCss)).toMatch(/\.sayPanel \.sayMicBtn:active:not\(:disabled\) \{ transition: none; transform: scale\(calc\(var\(--mic-scale\) \* \.95\)\); \}/)
    expect(strip(micCss)).toMatch(/\.sayPanel \.sayMicBtn--done:disabled, \.sayPanel \.sayMicBtn--off:disabled \{ opacity: 1; \}/)
  })

  it('пульс только в состоянии «доступ выдан»: на обёртке .sayMicPulse (transform кнопки занят размером), в locked / active / done / off пульса нет', () => {
    const code = strip(stateCss)
    expect(code).toMatch(/\.sayMicBox--ready \.sayMicPulse \{ animation: sayBtnPulse [\d.]+s ease-in-out infinite; \}/)
    expect((code.match(/animation: sayBtnPulse/g) ?? []).length).toBe(1)
    const peak = Number(code.match(/@keyframes sayBtnPulse\s*\{[^@]*?50%\s*\{\s*transform:\s*scale\(([\d.]+)\)/)[1])
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(1.1)
    expect(panelSrc['SayStage.jsx']).toMatch(/<span className="sayMicPulse">\s*<button/)
  })

  it('состояние круга: панель считает micVisualState({ ...sp.access, phase }) и передаёт в SayStage (класс на корне, aria-label по состоянию); хук отдаёт access из perm.access() и перерисовывается после ответа query', () => {
    const body = panelSrc['SayPhrasePanel.jsx']
    const hook = panelSrc['useSayPhrase.js']
    const stage = panelSrc['SayStage.jsx']
    expect(body).toContain('micVisualState({ ...sp.access, phase })')
    expect(body).toContain("locked: micState === 'locked'")
    expect(body).toContain('state={micState}')
    expect(hook).toContain('access: perm.access()')
    expect(hook).toContain('onRefreshed: bumpAccess')
    expect(hook).toContain('.then(bumpAccess)')
    expect(stage).toContain('MIC_ALLOW_ARIA')
    expect(stage).toContain("state === 'locked' ? MIC_ALLOW_ARIA : label")
    expect(stage).toContain('data-state={state}')
    // логика движков не тронута: решение по тапу, begin и confirmExplain как были
    expect(hook).toMatch(/const confirmExplain = useCallback\(\(\) => \{ perm\.markExplained\(\); perm\.markPreShown\(\); begin\(\) \}/)
    expect(hook).toContain('planTap({ view: s.view, decision: perm.decide()')
  })
})
