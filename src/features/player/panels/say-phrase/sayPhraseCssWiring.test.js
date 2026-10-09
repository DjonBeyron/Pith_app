import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NODE_TYPES, TYPE_SHORT } from '../../../canvas/nodeTypes.js'

// Проводка модуля «Сказать фразу»: CSS (раскладка, морфинг кнопки в квадрат, кольца, заголовок) и редактор. Остальная проводка — sayPhraseWiring.test.js
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))
const css = read('../../../../styles/player/panels/say-phrase.css')
const micCss = read('../../../../styles/player/panels/say-phrase-mic.css')
const strip = c => c.replace(/\/\*[\s\S]*?\*\//g, '')
const indexCss = read('../../../../index.css')
const answerFields = read('../../../canvas/NodeAnswerFields.jsx')
const contentEditor = read('../../../canvas/NodeContentEditor.jsx')

describe('say_phrase — CSS и редактор', () => {
  it('стили подключены; без filter/blur/box-shadow; высота блоков постоянна, квадрат 116 по центру тела', () => {
    expect(indexCss).toContain("@import './styles/player/panels/say-phrase.css';")
    expect(indexCss).toContain("@import './styles/player/panels/say-phrase-mic.css';")
    for (const c of [css, micCss]) expect(strip(c)).not.toMatch(/filter\s*:|blur\(|box-shadow\s*:|backdrop-filter/)
    expect(css).toContain('.sayPhraseSpacer')
    expect(css).toMatch(/\.sayBody \{[^}]*height: 206px/)
    expect(css).toMatch(/\.sayLabel \{[^}]*height: 26px/)
    expect(css).toMatch(/\.sayMicBox \{[^}]*top: 45px[^}]*height: 116px/) // (206 − 116) / 2: центр квадрата = центр тела = центр панели
    expect(css).toMatch(/\.sayInner \{ padding: 11px 16px 12px/) // рамка 1 + 11 сверху = 12 снизу: центр кнопки = центр панели
    expect(css).not.toContain('.sayInfo') // подсказок-текстов в панели нет
  })

  it('анимации: кольца и иконка — только transform/opacity; layout-анимация (width/height/radius) — лишь морфинг ОДНОЙ кнопки', () => {
    const code = strip(micCss)
    const frames = [...code.matchAll(/@keyframes\s+(\w+)\s*\{([\s\S]*?)\n\}/g)]
    expect(frames.map(f => f[1]).sort()).toEqual(['sayMorphIn', 'sayMorphOut'])
    for (const [, name, body] of frames) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map(m => m[1]).filter(p => p !== 'animation-timing-function')
      expect(props.every(p => ['width', 'height', 'border-radius'].includes(p)), name).toBe(true)
    }
    expect(code).not.toMatch(/sayRingPulse|sayRecBlink|@keyframes\s+(?!sayMorph)/)
    const rings = code.match(/\.sayRing \{[^}]*\}/)[0]
    expect(rings).toMatch(/border-radius: 22px/) // скруглённые квадраты тем же радиусом, что у кнопки
    expect(rings).toMatch(/width: 116px;\s*height: 116px/)
    for (const n of [1, 2, 3]) expect(code).toMatch(new RegExp(`\\.sayRing${n} \\{ transform: scale\\(calc\\(1 \\+ var\\(--say-lvl\\d?, 0\\) \\* [\\d.]+\\)\\);\\s*opacity: calc\\(`))
  })

  it('заголовок «Произнесите фразу» набран стилем бывших слов фразы (SayWords, v3.2.1897): Montserrat 19px/700, lh 26, #e8eaee, по центру', () => {
    const label = css.match(/\.sayLabel \{[^}]*\}/)[0]
    expect(label).toContain("font-family: 'Montserrat', 'Comfortaa', sans-serif")
    expect(label).toMatch(/font-size: 19px/)
    expect(label).toMatch(/font-weight: 700/)
    expect(label).toMatch(/line-height: 26px/)
    expect(label).toMatch(/color: #e8eaee/)
    expect(label).toMatch(/text-align: center/)
    expect(label).toMatch(/transition: opacity \.15s/) // на нажатии плавно гаснет ~150 мс
    expect(css).toMatch(/\.sayLabel--hidden \{ opacity: 0; \}/) // место не схлопывается: высота панели постоянна
    expect(strip(css)).not.toMatch(/\.sayLabel--hidden[^}]*(display|height|visibility)/)
  })

  it('кнопка: один элемент, ВСЕГДА зелёная (кроме выключенной), квадрат 116px, нажатие без перехода, нет точек и красной точки, reduced-motion без анимаций', () => {
    const code = strip(micCss)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn \{[^}]*position: absolute;[^}]*inset: 0;[^}]*margin: auto;[^}]*width: 100%;[^}]*height: 52px/)
    const base = code.match(/\.sayPanel \.sayMicBtn \{[^}]*\}/)[0]
    expect(base).toMatch(/background: #b6fe3b/)
    expect(base).toMatch(/border: 0;/) // лаймовая рамка .phraseCheckBtn на красном слое неудачи давала бы зелёную кайму
    expect(base).toMatch(/color: #000/)
    expect(code).not.toMatch(/@media \(hover: none\)/) // прежнее «тёмное в покое» на тач-экране убрано
    expect(code).not.toMatch(/sayMicBtn--(idle|count|busy|listening)[^{]*\{[^}]*background: #12141d/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--off:disabled \{[^}]*background: #12141d/) // единственный не зелёный вид — выключенная
    expect(code).toMatch(/\.sayPanel \.sayMicBtn:active:not\(:disabled\) \{ transition: none;/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--in \{ width: 116px; height: 116px; border-radius: 22px;/)
    expect(code).not.toMatch(/80px|104px|sayRecDot|sayMicDots|sayMicRing|#ff3b30|sayMicCaption/)
    expect(code).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none !important/)
    const stage = strip(panelSrc['SayStage.jsx'].replace(/\/\/.*$/gm, ''))
    expect(stage).not.toMatch(/sayMicDots|sayRecDot|sayMicRing|<i key=\{n\}|dots/)
    expect((stage.match(/<Mic /g) ?? []).length).toBe(2) // иконка микрофона прямоугольника (гаснет) и иконка в верхней половине квадрата
    expect(stage).toContain('<Square ')               // иконка «стоп» (квадратик) в нижней половине
    expect((stage.match(/sayRing\d/g) ?? []).length).toBe(3)
  })

  it('иконка и текст прямоугольника НЕ едут, а плавно гаснут (opacity); в квадрате иконка микрофона быстро проступает слева сверху', () => {
    const code = strip(micCss)
    expect(code).not.toMatch(/--say-icon-dx|translate\(/) // «едет в центр и растёт» убрано
    expect(code).toMatch(/\.sayRectLayer \{[^}]*transition: opacity \.2s \.2s;/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--in \.sayRectLayer \{ opacity: 0; transition: opacity \.14s; \}/) // гаснет за шаг 1 (≈156 мс)
    expect(code).toMatch(/\.sayMicBtn--prep \.sayCells, \.sayMicBtn--listening \.sayCells \{ opacity: 1; transition: opacity \.12s \.14s; \}/) // быстро, когда сужение кончилось
    expect(panelSrc['SayStage.jsx']).not.toContain('--say-icon-dx')
    expect(panelSrc['SayStage.jsx']).not.toMatch(/useLayoutEffect|ICON_GAP/)
  })

  it('квадрат: две половины (сверху индикатор «Слушаю», снизу «Стоп» — единственная нажимаемая), линия 1px, цвета одного зелёного', () => {
    const code = strip(micCss)
    const stage = panelSrc['SayStage.jsx']
    expect(stage.indexOf('sayCellTop')).toBeLessThan(stage.indexOf('sayDivider'))
    expect(stage.indexOf('sayDivider')).toBeLessThan(stage.indexOf('sayCellStop'))
    expect(stage).toContain('{LISTENING}')
    expect(stage).toContain('{STOP}')
    expect(code).toMatch(/\.sayDivider \{[^}]*top: 50%;[^}]*height: 1px;[^}]*background: rgba\(0, 0, 0, \.3\)/) // тёмный полупрозрачный
    expect(code).toMatch(/\.sayCell \{[^}]*height: 50%/)                         // две равные половины
    expect(code).toMatch(/\.sayCellIcon \{[^}]*width: 26px/)                     // иконки слева в одной колонке, текст справа
    expect(code).toMatch(/\.sayMicBtn--listening \.sayCellStop \{ pointer-events: auto;/) // «Стоп» принимает нажатия только пока слушаем
    expect(code).toMatch(/\.sayCellStop \{ bottom: 0; \}/)
    expect(code).not.toMatch(/\.sayCellTop[^{]*\{[^}]*pointer-events: auto/)      // верхняя половина — индикатор
    expect(code).toMatch(/\.sayCellTop \.sayCellText \{ opacity: 0;/)             // «Слушаю» — только когда И морфинг кончился, И движок слушает (listening)
    expect(code).toMatch(/\.sayMicBtn--listening \.sayCellTop \.sayCellText \{ opacity: 1; \}/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--in \{[^}]*pointer-events: none/) // квадрат целиком нажатий не принимает, кроме «Стоп»
  })

  it('итог: успех — галочка и «Верно» по центру на зелёном (форма не меняется); неудача — крестик и красный СЛОЙ, плавно через opacity (background-color не анимируем)', () => {
    const code = strip(micCss)
    const stage = panelSrc['SayStage.jsx']
    expect(stage).toContain('<Check ')
    expect(stage).toContain('<X ')
    expect(stage).toContain('sayRed')
    expect(code).toMatch(/\.sayResult \{[^}]*flex-direction: column;[^}]*align-items: center;[^}]*justify-content: center/)
    expect(code).toMatch(/\.sayMicBtn--ok \.sayResult, \.sayMicBtn--fail \.sayResult \{ opacity: 1;/)
    expect(code).toMatch(/\.sayRed \{[^}]*background: #ff6b5e;[^}]*opacity: 0;[^}]*transition: opacity \.25s;/)
    expect(code).toMatch(/\.sayMicBtn--fail \.sayRed \{ opacity: 1; \}/)
    expect(code).not.toMatch(/\.sayMicBtn--(ok|fail)[^{]*\{[^}]*(background(-color)?:|width|height)/) // зелёный остаётся, квадрат не меняет форму
    expect(code).not.toMatch(/transition:[^;]*background-color/)
    expect(code).not.toMatch(/@keyframes\s+\w*(Red|Fail|Ok)/)
  })

  it('«Попытка N»: справа вверху области кнопки, абсолютно (кнопку и высоту не двигает), приглушённая, на 320px мельче; в DOM ради плавности, показывается по классу', () => {
    const code = strip(micCss)
    const att = code.match(/\.sayAttempt \{[^}]*\}/)[0]
    expect(att).toMatch(/position: absolute;\s*top: 0;\s*right: 0/)
    expect(att).toMatch(/pointer-events: none/)
    expect(att).toMatch(/color: rgba\(255, 255, 255, \.45\)/)
    expect(att).not.toMatch(/(^|[^-])\bheight:|margin|width:/m)
    expect(code).toMatch(/\.sayAttempt--on \{ opacity: 1; \}/)
    expect(code).toMatch(/@media \(max-width: 340px\) \{ \.sayAttempt \{ font-size: 11px; \} \}/)
    expect(panelSrc['SayStage.jsx']).toContain("sayAttempt${attempts ? ' sayAttempt--on' : ''}")
    expect(panelSrc['SayPhrasePanel.jsx']).toContain('attemptText({ taps: sp.taps, failStreak: sp.failStreak, phase })')
  })

  it('«Я не могу говорить» плавно гаснет, пока кнопка — квадрат (opacity ≈ 180 мс), место не схлопывается, касания не принимает; админская палочка — слева', () => {
    const code = strip(css)
    expect(code).toMatch(/\.saySkipLink \{ transition: opacity \.18s; \}/)
    expect(code).toMatch(/\.saySkipLink\.saySkipLink--hidden \{ opacity: 0; pointer-events: none; \}/)
    expect(code).not.toMatch(/saySkipLink--hidden[^}]*(display|height|visibility)/)
    expect(panelSrc['SayActions.jsx']).toContain("saySkipLink${hideSkip ? ' saySkipLink--hidden' : ''}")
    expect(panelSrc['SayPhrasePanel.jsx']).toContain('hideSkip={square}')
    expect(panelSrc['SayPhrasePanel.jsx']).toContain('<SolveCorrectButton side="left"')
    expect(read('../../../../styles/player/admin-solve.css')).toMatch(/\.solveCorrectBtn--left \{ right: auto; left: 8px; \}/)
  })

  it('кольца: три, только в квадрате, значения берут из CSS-переменных (--say-lvl*), которые пишет rAF-хук без ререндеров; transition по transform у колец НЕТ', () => {
    const hook = panelSrc['useSayRings.js'].replace(/\/\/.*$/gm, '')
    expect(hook).toContain("['--say-lvl', '--say-lvl2', '--say-lvl3']")
    expect(hook).toContain('el.style.setProperty(VARS[i]')
    expect(hook).toContain('requestAnimationFrame(tick)')
    expect(hook).toContain('cancelAnimationFrame(raf)')
    expect(hook).not.toMatch(/setState|useState|dispatch/) // без ререндеров React
    expect(hook).not.toMatch(/getUserMedia|AudioContext|AnalyserNode/)
    expect(strip(micCss)).toMatch(/\.sayMicBox--prep \.sayRings, \.sayMicBox--listening \.sayRings \{ opacity: 1;/)
    // запаздывание не должно прятаться в CSS: ни у колец, ни у их контейнера нет transition по transform (у контейнера — только opacity на показ/скрытие)
    const code = strip(micCss)
    for (const sel of ['\\.sayRing', '\\.sayRing[123]']) {
      for (const [rule] of code.matchAll(new RegExp(`${sel} \\{[^}]*\\}`, 'g'))) expect(rule).not.toMatch(/transition|animation/)
    }
    expect(code.match(/\.sayRings \{[^}]*\}/)[0]).toMatch(/transition: opacity \.2s;/)
    expect(code).not.toMatch(/\.sayRings?\d?[^{]*\{[^}]*transition:[^;]*transform/)
    expect(hook).toContain('rootRef.current') // переменные пишем в контейнер колец, а не в корень кнопки: пересчёт стилей только у трёх колец
  })

  it('кнопки панели — .phraseCheckBtn без своих размеров (единый вид «Проверить»)', () => {
    expect(panelSrc['SayStage.jsx']).toContain('phraseCheckBtn sayMicBtn')
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\.phraseCheckBtn/)
  })

  it('редактор: тип в меню, короткая подпись, пикер в NodeAnswerFields, нет общего блока триггеров', () => {
    expect(NODE_TYPES.some(t => t.value === 'say_phrase')).toBe(true)
    expect(TYPE_SHORT.say_phrase).toBeTruthy()
    expect(answerFields).toContain("node.type === 'say_phrase'")
    expect(answerFields).toContain('<NodeSayPhrasePicker')
    expect(contentEditor).toContain("node.type !== 'say_phrase'")
  })
})
