import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NODE_TYPES, TYPE_SHORT } from '../../../canvas/nodeTypes.js'

// Проводка модуля «Сказать фразу»: CSS (раскладка, морфинг кнопки, кольца, заголовок) и редактор. Остальная проводка — sayPhraseWiring.test.js
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
  it('стили подключены; без filter/blur/box-shadow; высота блоков постоянна, круг 104 по центру тела', () => {
    expect(indexCss).toContain("@import './styles/player/panels/say-phrase.css';")
    expect(indexCss).toContain("@import './styles/player/panels/say-phrase-mic.css';")
    for (const c of [css, micCss]) expect(strip(c)).not.toMatch(/filter\s*:|blur\(|box-shadow\s*:|backdrop-filter/)
    expect(css).toContain('.sayPhraseSpacer')
    expect(css).toMatch(/\.sayBody \{[^}]*height: 206px/)
    expect(css).toMatch(/\.sayLabel \{[^}]*height: 26px/)
    expect(css).toMatch(/\.sayMicBox \{[^}]*top: 51px[^}]*height: 104px/) // (206 − 104) / 2: центр круга = центр тела = центр панели
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
    expect(rings).toMatch(/border-radius: 50%/)
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

  it('кнопка: один элемент, ВСЕГДА зелёная (кроме выключенной), круг 104px, нажатие без перехода, нет точек и красной точки, reduced-motion без анимаций', () => {
    const code = strip(micCss)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn \{[^}]*position: absolute;[^}]*inset: 0;[^}]*margin: auto;[^}]*width: 100%;[^}]*height: 52px/)
    const base = code.match(/\.sayPanel \.sayMicBtn \{[^}]*\}/)[0]
    expect(base).toMatch(/background: #b6fe3b/)
    expect(base).toMatch(/border-color: #b6fe3b/)
    expect(base).toMatch(/color: #000/)
    expect(code).not.toMatch(/@media \(hover: none\)/) // прежнее «тёмное в покое» на тач-экране убрано
    expect(code).not.toMatch(/sayMicBtn--(idle|count|busy|listening)[^{]*\{[^}]*background: #12141d/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--off:disabled \{[^}]*background: #12141d/) // единственный не зелёный вид — выключенная
    expect(code).toMatch(/\.sayPanel \.sayMicBtn:active:not\(:disabled\) \{ transition: none;/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--in \{ width: 104px; height: 104px; border-radius: 52px;/)
    expect(code).not.toMatch(/80px|sayRecDot|sayMicDots|sayMicRing|#ff3b30/)
    expect(code).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none !important/)
    const stage = strip(panelSrc['SayStage.jsx'].replace(/\/\/.*$/gm, ''))
    expect(stage).not.toMatch(/sayMicDots|sayRecDot|sayMicRing|<i key=\{n\}|dots/)
    expect(stage.match(/<Icon /g)).toHaveLength(1) // иконка одна: она и едет в центр круга
    expect(stage).toContain('sayMicCaption')
    expect((stage.match(/sayRing\d/g) ?? []).length).toBe(3)
  })

  it('иконка едет из позиции слева от текста в центр круга и растёт (transform), текст гаснет, подпись «Слушаю…» под иконкой после морфинга', () => {
    const code = strip(micCss)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--in \.sayMicIcon \{ transform: translate\(var\(--say-icon-dx, 0px\), -9px\) scale\(1\.5\);/)
    expect(code).toMatch(/\.sayMicIcon \{ flex: none; transition: transform [^;]*\.22s;/) // обратно — во второй половине морфинга
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--in \.sayMicText \{ opacity: 0;/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--listening \.sayMicCaption \{ opacity: 1;/)
    expect(code).toMatch(/\.sayMicCaption \{[^}]*font-size: 12px/)
    expect(panelSrc['SayStage.jsx']).toContain("'--say-icon-dx'")
  })

  it('кольца: три, только внутри круга, значения берут из CSS-переменных (--say-lvl*), которые пишет rAF-хук без ререндеров', () => {
    const hook = panelSrc['useSayRings.js'].replace(/\/\/.*$/gm, '')
    expect(hook).toContain("['--say-lvl', '--say-lvl2', '--say-lvl3']")
    expect(hook).toContain('el.style.setProperty(VARS[i]')
    expect(hook).toContain('requestAnimationFrame(tick)')
    expect(hook).toContain('cancelAnimationFrame(raf)')
    expect(hook).not.toMatch(/setState|useState|dispatch/) // без ререндеров React
    expect(hook).not.toMatch(/getUserMedia|AudioContext|AnalyserNode/)
    expect(strip(micCss)).toMatch(/\.sayMicBox--prep \.sayRings, \.sayMicBox--listening \.sayRings \{ opacity: 1;/)
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
