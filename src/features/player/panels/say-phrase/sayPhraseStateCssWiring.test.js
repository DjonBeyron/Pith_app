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

  it('запись: круг растёт ПРУЖИНОЙ с перелётом (linear() и запасной cubic-bezier для Safari 16); нажатие — без перехода; возврат из записи — быстрая плавная смена цвета без пружины', () => {
    const code = strip(stateCss)
    // цвет кнопки под диском меняется сразу (его не видно), заливку и цвет значка ведут анимации (CSS-анимации, а не transition: их не обрывает :active { transition: none })
    expect(code).toMatch(/\.sayMicBox--active \.sayMicBtn \{\s*transition: transform \.6s cubic-bezier\(\.34, 1\.8, \.55, 1\), background 0s, border-color \.2s, color 0s/)
    const sup = code.match(/@supports \(transition-timing-function: linear\(0, 1\)\) \{[\s\S]*?\n\}/)[0]
    const pts = sup.match(/linear\(([^)]*)\)\s*,\s*background/)[1].split(',').map(Number)
    expect(Math.max(...pts)).toBeGreaterThan(1.1)   // перелёт ≈ 16%
    expect(Math.max(...pts)).toBeLessThan(1.3)
    expect(pts[0]).toBe(0)
    expect(pts[pts.length - 1]).toBe(1)             // пружина оседает точно в цель
    expect(pts.slice(8).some(v => v < 1)).toBe(true) // и успевает «недолететь» после первого перелёта (колебание)
    expect(strip(micCss)).toMatch(/\.sayPanel \.sayMicBtn:active:not\(:disabled\) \{ transition: none; transform: scale\(calc\(var\(--mic-scale\) \* \.95\)\); \}/)
    expect(strip(micCss)).toMatch(/\.sayPanel \.sayMicBtn--done:disabled, \.sayPanel \.sayMicBtn--off:disabled \{ opacity: 1; \}/)
    // возврат: базовый transition кнопки — цвет и значок плавно за .32s (без пружины и без «раскрытия»)
    expect(strip(micCss).match(/\.sayPanel \.sayMicBtn \{[^}]*\}/)[0]).toMatch(/transition: transform \.45s cubic-bezier\(\.22, 1, \.36, 1\), background \.32s, border-color \.32s, color \.32s/)
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
    // значок: анимация цвета на ту же длительность; пока лайм не дошёл — прежний цвет, потом тёмный
    expect(code).toMatch(/\.sayMicBox--active \.sayFaceMic \{ animation: sayIconInk var\(--say-fill-t\) ease-in-out both; \}/)
    expect(code).toMatch(/0%, 20%\s*\{ color: var\(--from-ink, var\(--say-lime\)\); \}[\s\S]*50%, 100% \{ color: var\(--say-ink\); \}/)
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
    expect(code).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.sayMicBox--active \.sayMicBtn \{ transition: background \.2s, border-color \.2s, color \.2s, opacity \.2s; \}[^}]*\n\s*\.sayMicBox--active \.sayFaceMic \{ animation: none; \}/)
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
