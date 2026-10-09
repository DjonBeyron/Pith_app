import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NODE_TYPES, TYPE_SHORT } from '../../../canvas/nodeTypes.js'

// Проводка модуля «Сказать фразу»: CSS (раскладка, морфинг кнопки, заголовок) и редактор. Остальная проводка — sayPhraseWiring.test.js
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))
const css = read('../../../../styles/player/panels/say-phrase.css')
const indexCss = read('../../../../index.css')
const answerFields = read('../../../canvas/NodeAnswerFields.jsx')
const contentEditor = read('../../../canvas/NodeContentEditor.jsx')

describe('say_phrase — CSS и редактор', () => {
  it('стили подключены; анимации только opacity/transform; без filter/blur/box-shadow; высота блоков постоянна', () => {
    expect(indexCss).toContain("@import './styles/player/panels/say-phrase.css';")
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/filter\s*:|blur\(|box-shadow\s*:|backdrop-filter/)
    const frames = [...code.matchAll(/@keyframes\s+(\w+)\s*\{([\s\S]*?)\}\s*\}/g)]
    expect(frames.length).toBeGreaterThan(0)
    for (const [, name, body] of frames) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map(m => m[1])
      expect(props.every(p => p === 'transform' || p === 'opacity'), name).toBe(true)
    }
    expect(css).toContain('.sayPhraseSpacer')
    expect(css).toMatch(/\.sayBody \{[^}]*height: 206px/)
    expect(css).toMatch(/\.sayLabel \{[^}]*height: 26px/)
    expect(css).toMatch(/\.sayInfo \{[^}]*height: 34px/)
    expect(css).toMatch(/\.sayMicBox \{[^}]*top: 77px[^}]*height: 52px/)
    expect(css).toMatch(/\.sayFoot \{[^}]*height: 44px/)
    expect(css).toMatch(/\.sayInner \{ padding: 11px 16px 12px/) // рамка 1 + 11 сверху = 12 снизу: центр кнопки = центр панели
  })

  it('заголовок «Произнесите фразу» набран стилем бывших слов фразы (SayWords, v3.2.1897): Montserrat 19px/700, lh 26, #e8eaee, по центру', () => {
    const label = css.match(/\.sayLabel \{[^}]*\}/)[0]
    expect(label).toContain("font-family: 'Montserrat', 'Comfortaa', sans-serif")
    expect(label).toMatch(/font-size: 19px/)
    expect(label).toMatch(/font-weight: 700/)
    expect(label).toMatch(/line-height: 26px/)
    expect(label).toMatch(/color: #e8eaee/)
    expect(label).toMatch(/text-align: center/)
  })

  it('кнопка-морфинг: один элемент, ширина/высота/радиус; круг 80px; красная точка; нажатие без перехода; reduced-motion без анимаций', () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toMatch(/\.sayPanel \.sayMicBtn \{[^}]*position: absolute;[^}]*inset: 0;[^}]*margin: auto;[^}]*width: 100%;[^}]*height: 52px/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--listening \{ width: 80px; height: 80px; border-radius: 50%; \}/)
    expect(code).toMatch(/transition:[^;]*width[^;]*height[^;]*border-radius/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn:active:not\(:disabled\) \{ transition: none;/)
    expect(code).toMatch(/\.sayRecDot \{[^}]*background: #ff3b30/)
    expect(code).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*transition: none !important/)
    expect(code).toMatch(/\.sayMicBox--listening \.sayRecDot \{ opacity: 1; animation: sayRecBlink/)
    const stage = panelSrc['SayStage.jsx']
    expect(stage).toContain('sayMicDots')
    expect(stage).toContain('sayRecDot')
    expect(stage).toContain('<i key={n}')
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
