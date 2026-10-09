import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NODE_TYPES, TYPE_SHORT } from '../../../canvas/nodeTypes.js'
import { RING_K, RING_COUNT, CIRCLE_R } from '../../../../shared/lib/speech/sayRings.js'

// Проводка модуля «Сказать фразу»: CSS (раскладка, круглая кнопка, волны, надпись над кругом) и редактор. Остальная проводка — sayPhraseWiring.test.js
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))
const css = read('../../../../styles/player/panels/say-phrase.css')
const micCss = read('../../../../styles/player/panels/say-phrase-mic.css')
const wavesCss = read('../../../../styles/player/panels/say-phrase-waves.css')
const strip = c => c.replace(/\/\*[\s\S]*?\*\//g, '')
const indexCss = read('../../../../index.css')
const answerFields = read('../../../canvas/NodeAnswerFields.jsx')
const contentEditor = read('../../../canvas/NodeContentEditor.jsx')
const frames = c => [...strip(c).matchAll(/@keyframes\s+(\w+)\s*\{([\s\S]*?)\n\}/g)]

describe('say_phrase — CSS и редактор', () => {
  it('стили подключены; без filter/blur/box-shadow; каждый CSS-файл ≤ 250 строк; круг 116 по центру тела', () => {
    for (const f of ['say-phrase', 'say-phrase-mic', 'say-phrase-waves']) expect(indexCss).toContain(`@import './styles/player/panels/${f}.css';`)
    for (const c of [css, micCss, wavesCss]) {
      expect(strip(c)).not.toMatch(/filter\s*:|blur\(|box-shadow\s*:|backdrop-filter/)
      expect(c.split('\n').length).toBeLessThanOrEqual(250)
    }
    expect(css).toContain('.sayPhraseSpacer')
    expect(css).toMatch(/\.sayBody \{[^}]*height: 206px/)
    expect(css).toMatch(/\.sayCaption \{[^}]*height: 26px/)
    expect(css).toMatch(/\.sayMicBox \{[^}]*top: 45px[^}]*height: 116px/) // (206 − 116) / 2: центр круга = центр тела = центр панели
    expect(css).toMatch(/\.sayInner \{ padding: 11px 16px 12px/)         // рамка 1 + 11 сверху = 12 снизу: центр круга = центр панели
    expect(css).not.toContain('.sayInfo')                                // подсказок-текстов в панели нет
  })

  it('кнопка ВСЕГДА круглая: 116×116, border-radius 50%, нигде в CSS не меняет ни размер, ни форму; всегда зелёная (кроме выключенной)', () => {
    const code = strip(micCss)
    const base = code.match(/\.sayPanel \.sayMicBtn \{[^}]*\}/)[0]
    expect(base).toMatch(/width: 116px;\s*height: 116px/)
    expect(base).toMatch(/border-radius: 50%/)
    expect(base).toMatch(/background: #b6fe3b/)
    expect(base).toMatch(/border: 0;/)
    expect(base).toMatch(/color: #000/)
    // ни морфинга, ни квадрата, ни прямоугольника: размеры и скругление задаёт только базовое правило
    const all = strip(micCss + wavesCss + css)
    expect(all).not.toMatch(/sayMorph|sayMicBtn--(in|out)|border-radius: (12|22|24|20)px|height: 52px|border-radius: 22px/)
    for (const [, selector, decl] of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selector.includes('.sayMicBtn') || selector.trim() === '.sayPanel .sayMicBtn') continue
      expect(selector.trim(), selector).not.toMatch(/\{/)
      expect(decl, selector).not.toMatch(/(^|[;\s])(width|height|border-radius)\s*:/)
    }
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--off:disabled \{[^}]*background: #12141d/) // единственный не зелёный вид
    expect(code).not.toMatch(/sayMicBtn--(idle|retry|prep|listening)[^{]*\{[^}]*background: #12141d/)
  })

  it('пульс: в покое слегка (transform scale), при записи сильнее и быстрее; нажатие без перехода; на успехе и «выключен» пульса нет', () => {
    const code = strip(micCss)
    const peak = name => Number(code.match(new RegExp(`@keyframes ${name}\\s*\\{[^@]*?50%\\s*\\{\\s*transform:\\s*scale\\(([\\d.]+)\\)`))[1])
    expect(peak('sayBtnPulse')).toBeGreaterThan(1)
    expect(peak('sayBtnPulseLive')).toBeGreaterThan(peak('sayBtnPulse'))
    const sec = n => Number(code.match(new RegExp(`animation: ${n} ([\\d.]+)s`))[1])
    expect(sec('sayBtnPulseLive')).toBeLessThan(sec('sayBtnPulse'))
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--live \{ animation: sayBtnPulseLive/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn:active:not\(:disabled\) \{ animation: none; transition: none;/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--ok, \.sayPanel \.sayMicBtn--off \{ animation: none; \}/)
    expect(code).toMatch(/\.sayPanel \.sayMicBtn--ok:disabled \{ opacity: 1; \}/)
  })

  it('содержимое круга: только значок микрофона; на успехе значок плавно сменяется галочкой и «Готово» (opacity+scale); крестика и красного слоя нет', () => {
    const code = strip(micCss)
    const stage = panelSrc['SayStage.jsx'].replace(/\/\/.*$/gm, '')
    expect((stage.match(/<Mic /g) ?? []).length).toBe(1)
    expect(stage).toContain('<MicOff ')
    expect(stage).toContain('<Check ')
    expect(stage).not.toMatch(/<X |\bsayRed\b|sayResult/)
    expect(code).toMatch(/\.sayFaceMic \{ opacity: 1; transform: scale\(1\); \}/)
    expect(code).toMatch(/\.sayFaceDone \{ opacity: 0; transform: scale\(\.6\);/)
    expect(code).toMatch(/\.sayMicBtn--ok \.sayFaceMic \{ opacity: 0;/)
    expect(code).toMatch(/\.sayMicBtn--ok \.sayFaceDone \{ opacity: 1; transform: scale\(1\);/)
    expect(code).toMatch(/\.sayFace \{[^}]*transition: opacity \.22s, transform/)
    expect(code).not.toMatch(/#ff6b5e|#ff3b30|\bsayRed\b|sayMicBtn--fail|transition:[^;]*background-color/)
  })

  it('все анимации — только transform/opacity (layout не трогаем): кнопка пульсирует, искусственные волны расходятся', () => {
    const names = [...frames(micCss), ...frames(wavesCss)].map(f => f[1]).sort()
    expect(names).toEqual(['sayBtnPulse', 'sayBtnPulseLive', 'sayWaveOut'])
    for (const [, name, body] of [...frames(micCss), ...frames(wavesCss)]) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map(m => m[1]).filter(p => p !== 'animation-timing-function')
      expect(props.every(p => ['transform', 'opacity'].includes(p)), name).toBe(true)
    }
  })

  it('надпись над кругом: стиль бывших слов фразы, ячейка грида с кросс-фейдом (opacity + scale, как .feedTrSwap), высота постоянна; помещается на 320 px', () => {
    const cap = css.match(/\.sayCaption \{[^}]*\}/)[0]
    expect(cap).toContain("font-family: 'Montserrat', 'Comfortaa', sans-serif")
    expect(cap).toMatch(/font-size: clamp\(16px, 5\.2vw, 19px\)/) // на 320 px: 16,6 px × 26 символов ≈ 250 px при ширине 288
    expect(cap).toMatch(/font-weight: 700/)
    expect(cap).toMatch(/line-height: 26px/)
    expect(cap).toMatch(/color: #e8eaee/)
    expect(cap).toMatch(/display: grid/)
    expect(cap).toMatch(/white-space: nowrap/)
    const text = css.match(/\.sayCaptionText \{[^}]*\}/)[0]
    expect(text).toMatch(/grid-area: 1 \/ 1/)
    expect(text).toMatch(/transition: opacity 240ms ease, transform 240ms ease/)
    expect(css).toMatch(/\.sayCaptionText--on \{ opacity: 1; transform: none; \}/)
    expect(strip(css)).not.toMatch(/\.sayCaption[^{]*\{[^}]*(display: none|visibility)/) // место не схлопывается
    expect(css).toMatch(/\.sayCaptionLive \{[^}]*clip: rect\(0 0 0 0\)/)                  // aria-live-элемент виден только скринридеру
  })

  it('«Я не могу говорить» плавно гаснет на время записи (opacity ≈ 180 мс), место не схлопывается, касания не принимает; админская палочка — слева', () => {
    const code = strip(css)
    expect(code).toMatch(/\.saySkipLink \{ transition: opacity \.18s; \}/)
    expect(code).toMatch(/\.saySkipLink\.saySkipLink--hidden \{ opacity: 0; pointer-events: none; \}/)
    expect(code).not.toMatch(/saySkipLink--hidden[^}]*(display|height|visibility)/)
    expect(panelSrc['SayActions.jsx']).toContain("saySkipLink${hideSkip ? ' saySkipLink--hidden' : ''}")
    expect(panelSrc['SayPhrasePanel.jsx']).toContain('hideSkip={hideSkip}')
    expect(panelSrc['SayPhrasePanel.jsx']).toContain('<SolveCorrectButton side="left"')
    expect(read('../../../../styles/player/admin-solve.css')).toMatch(/\.solveCorrectBtn--left \{ right: auto; left: 8px; \}/)
  })

  it('волны: два слоя по три круглых кольца размером с кнопку; живой слой показывается только в режиме --live, искусственные в нём гаснут; у колец эквалайзера НЕТ transition/animation', () => {
    const code = strip(wavesCss)
    expect(code).toMatch(/\.sayWaveAnchor \{[^}]*top: 114px; width: 116px; height: 116px; margin: -58px 0 0 -58px/) // 11 + 45 + 58: центр круга
    expect(CIRCLE_R * 2).toBe(116)
    expect(code).toMatch(/\.sayIdleWaves i, \.sayEq i \{[^}]*border-radius: 50%/)
    expect(code).toMatch(/\.sayIdleWaves i:nth-child\(2\) \{ animation-delay: 1s; \}/)
    expect(code).toMatch(/\.sayWaveClip--live \.sayIdleWaves \{ opacity: 0; \}/)
    expect(code).toMatch(/\.sayWaveClip--live \.sayEq \{ opacity: 1; transition-duration: \.1s; \}/) // эквалайзер проявляется за 100 мс
    expect(code).toMatch(/\.sayWaveClip--calm \.sayIdleWaves \{ opacity: 0; \}/)
    for (const [rule] of code.matchAll(/\.sayEq i[^{]*\{[^}]*\}/g)) expect(rule, rule).not.toMatch(/transition|animation/)
    expect(code).toMatch(/\.sayEq \{ opacity: 0; transition: opacity \.25s; \}/) // transition только у слоя-контейнера и только по opacity
    const stage = panelSrc['SayStage.jsx']
    expect((stage.replace(/\/\/.*$/gm, '').match(/<i \/>/g) ?? []).length).toBe(RING_COUNT * 2)
    const jsx = stage.replace(/\/\/.*$/gm, '')
    expect(jsx.indexOf('sayWaveClip')).toBeLessThan(jsx.indexOf('<SayCaption')) // слой волн лежит под надписью и кнопкой
    expect(jsx.indexOf('<SayCaption')).toBeLessThan(jsx.indexOf('sayMicBox'))
  })

  it('волны не выходят за модуль: клип размером с содержимое панели обрезает всё лишнее, касания не принимает; предел радиуса (RING_K × круг) укладывается в половину панели', () => {
    const clip = strip(wavesCss).match(/\.sayWaveClip \{[^}]*\}/)[0]
    expect(clip).toMatch(/overflow: hidden/)
    expect(clip).toMatch(/pointer-events: none/)
    expect(clip).toMatch(/top: -11px;\s*bottom: -12px;\s*left: -16px;\s*right: -16px/) // края .phraseInner (padding 11 16 12)
    expect(Math.max(...RING_K) * CIRCLE_R + CIRCLE_R).toBeLessThanOrEqual(115) // ряд до верха/низа панели 230/2
    expect(panelSrc['SayStage.jsx']).toContain('aria-hidden="true" data-testid="say-waves"')
  })

  it('«уменьшить движение»: пульс кнопки отключён, искусственные волны не бегут (один статичный тихий круг), эквалайзер без JS-цикла (статичный круг)', () => {
    const media = strip(wavesCss).slice(strip(wavesCss).indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(media).toMatch(/\.sayIdleWaves i \{ animation: none; \}/)
    expect(media).toMatch(/\.sayEq i \{ transform: scale\(1\.2\) !important; opacity: \.3 !important; \}/)
    expect(strip(micCss)).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sayPanel \.sayMicBtn, \.sayPanel \.sayMicBtn--live \{ animation: none; \}/)
    expect(panelSrc['useSayWaves.js']).toContain('reducedMotion()')
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
