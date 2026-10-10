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
const stateCss = read('../../../../styles/player/panels/say-phrase-state.css')
const ringCss = read('../../../../styles/player/panels/say-phrase-ring.css')
const strip = c => c.replace(/\/\*[\s\S]*?\*\//g, '')
const indexCss = read('../../../../index.css')
const answerFields = read('../../../canvas/NodeAnswerFields.jsx')
const contentEditor = read('../../../canvas/NodeContentEditor.jsx')
const frames = c => [...strip(c).matchAll(/@keyframes\s+(\w+)\s*\{([\s\S]*?)\n\}/g)]

describe('say_phrase — CSS и редактор', () => {
  it('стили подключены; без filter/blur/box-shadow; каждый CSS-файл ≤ 250 строк; круг 100 по центру тела', () => {
    for (const f of ['say-phrase', 'say-phrase-mic', 'say-phrase-state', 'say-phrase-ring', 'say-phrase-waves']) expect(indexCss).toContain(`@import './styles/player/panels/${f}.css';`)
    for (const c of [css, micCss, stateCss, ringCss, wavesCss]) {
      expect(strip(c)).not.toMatch(/filter\s*:|blur\(|box-shadow\s*:|backdrop-filter/)
      expect(c.split('\n').length).toBeLessThanOrEqual(250)
    }
    expect(css).toContain('.sayPhraseSpacer')
    expect(css).toMatch(/\.sayBody \{[^}]*height: 206px/)
    expect(css).toMatch(/\.sayCaption \{[^}]*height: 26px/)
    expect(css).toMatch(/\.sayMicBox \{[^}]*top: 53px[^}]*height: 100px/) // (206 − 100) / 2: центр круга = центр тела = центр панели
    expect(css).toMatch(/\.sayInner \{ padding: 11px 16px 12px/)         // рамка 1 + 11 сверху = 12 снизу: центр круга = центр панели
    expect(css).not.toContain('.sayInfo')                                // подсказок-текстов в панели нет
  })

  it('кнопка ВСЕГДА круглая: 100×100, border-radius 50%, нигде в CSS не меняет ни размер, ни форму; цвет и размер — переменные состояния (--mic-scale / --mic-bg / --mic-ink)', () => {
    const code = strip(micCss)
    const base = code.match(/\.sayPanel \.sayMicBtn \{[^}]*\}/)[0]
    expect(base).toMatch(/width: 100px;\s*height: 100px/)
    expect(base).toMatch(/border-radius: 50%/)
    expect(base).toMatch(/background: var\(--mic-bg\)/)
    expect(base).toMatch(/color: var\(--mic-ink\)/)
    expect(base).toMatch(/transform: scale\(var\(--mic-scale\)\)/)
    expect(base).toMatch(/transition: transform \.45s/)
    expect(code).toMatch(/\.sayPanel \{ --say-lime: #b6fe3b; --say-ink: #101a08; \}/) // лайм-заливка записи; значок и «Готово» на ней — тёмные
    // ни морфинга, ни квадрата, ни прямоугольника: размеры и скругление задаёт только базовое правило
    const all = strip(micCss + stateCss + wavesCss + css)
    expect(all).not.toMatch(/sayMorph|sayMicBtn--(in|out)|border-radius: (12|22|24|20)px|height: 52px|border-radius: 22px/)
    for (const [, selector, decl] of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selector.includes('.sayMicBtn') || selector.trim() === '.sayPanel .sayMicBtn') continue
      expect(decl, selector).not.toMatch(/(^|[;\s])(width|height|border-radius)\s*:/)
    }
    expect(code).not.toMatch(/#ff6b5e|#ff3b30|\bsayRed\b|sayMicBtn--fail/) // красного слоя нет
  })

  it('значок микрофона — инлайн-SVG (капсула + U-дужка + ножка, толстые скруглённые линии), цвета только через CSS; черта «нет доступа» всегда в разметке и плавно прочерчивается/исчезает по состоянию', () => {
    const icon = panelSrc['SayMicIcon.jsx']
    expect(icon).toContain('<svg className="sayMicIcon"')
    expect(icon).toContain('className="sayMicBody"')
    expect(icon).toMatch(/className="sayMicStroke" d="M[^"]*a14\.5 14\.5/) // U-образная дужка и ножка одним штрихом
    expect(icon).toContain('sayMicSlash')
    expect(icon.replace(/\/\/.*$/gm, '')).not.toMatch(/#[0-9a-f]{3,6}|rgb\(|lucide|off/i) // цветов в разметке нет, условного «off» тоже
    const code = strip(micCss)
    expect(code).toMatch(/\.sayMicBody \{ fill: currentColor; \}/)
    expect(code).toMatch(/\.sayMicStroke \{[^}]*stroke: currentColor; stroke-width: 3\.6; stroke-linecap: round/)
    expect(code).toMatch(/\.sayMicSlash \{[^}]*stroke-dashoffset: 49; opacity: 0; transition: stroke-dashoffset \.38s/)
    expect(code).toMatch(/\.sayMicBox--locked \.sayMicSlash, \.sayMicBox--off \.sayMicSlash \{ stroke-dashoffset: 0; opacity: 1; \}/)
  })

  it('кольцо вокруг круга: SVG-stroke — трек + дуга (≈ ¼ окружности, скруглённые концы) + сплошное зелёное кольцо; значения — переменные состояния, меняются плавно; зелёное кольцо не исчезает в записи', () => {
    const ring = panelSrc['SayRing.jsx']
    expect(ring).toContain('className="sayRingTrack"')
    expect(ring).toContain('className="sayRingArc"')
    expect(ring).toContain('className="sayRingFull"')
    expect(ring).toContain('LEN / 4') // четверть окружности
    expect(ring.replace(/\/\/.*$/gm, '')).not.toMatch(/useState|useEffect|requestAnimationFrame/) // без React на кадр
    const code = strip(ringCss)
    expect(code).toMatch(/\.sayRing \{[^}]*width: 128px;\s*height: 128px;\s*margin: -64px 0 0 -64px;[^}]*pointer-events: none/) // диаметр круга 100 → зазор 8 px
    expect(code).toMatch(/\.sayRing \{[^}]*transform: scale\(var\(--ring-scale, 1\)\);\s*transition: transform \.6s/) // в записи кольцо растёт вместе с кругом
    expect(code).toMatch(/\.sayRingTrack \{ stroke: var\(--ring-track\); opacity: var\(--ring-track-o\); transition: stroke \.4s, opacity \.4s; \}/)
    expect(code).toMatch(/\.sayRingArc \{ stroke: var\(--ring-arc\); stroke-linecap: round; opacity: var\(--ring-arc-o\); transition: stroke \.4s, opacity \.4s; \}/)
    expect(code).toMatch(/\.sayRingFull \{ stroke: var\(--say-lime\); opacity: var\(--ring-full-o, 0\); transition: opacity \.4s; \}/)
    expect(code).not.toMatch(/sayMicBox--done \.sayRingFull/) // «Готово» тоже через переменную
    expect(code.slice(code.indexOf('@media (prefers-reduced-motion: reduce)'))).toMatch(/\.sayRingSpin \{ animation: none; \}/)
    const stage = panelSrc['SayStage.jsx']
    expect(stage).toContain('<SayRing />')
    expect(stage.indexOf('<SayRing />')).toBeLessThan(stage.indexOf('<button')) // кольцо в .sayMicBox рядом с кнопкой
  })

  it('содержимое круга: только значок микрофона; на успехе значок плавно сменяется галочкой и «Готово» (opacity+scale); крестика и красного слоя нет', () => {
    const code = strip(micCss)
    const stage = panelSrc['SayStage.jsx'].replace(/\/\/.*$/gm, '')
    expect((stage.match(/<SayMicIcon /g) ?? []).length).toBe(1)
    expect(stage).not.toMatch(/off=\{/) // перечёркивание — CSS по состоянию, не проп
    expect(stage).toContain('<Check ')
    expect(stage).not.toMatch(/<X |\bsayRed\b|sayResult/)
    expect(code).toMatch(/\.sayFaceMic \{ opacity: 1; transform: scale\(1\); \}/)
    expect(code).toMatch(/\.sayFaceDone \{ opacity: 0; transform: scale\(\.6\);/)
    expect(code).toMatch(/\.sayMicBtn--done \.sayFaceMic \{ opacity: 0;/)
    expect(code).toMatch(/\.sayMicBtn--done \.sayFaceDone \{ opacity: 1; transform: scale\(1\);/)
    expect(code).toMatch(/\.sayFace \{[^}]*transition: opacity \.22s, transform/)
    expect(code).not.toMatch(/#ff6b5e|#ff3b30|\bsayRed\b|sayMicBtn--fail/)
  })

  it('все анимации — только transform/opacity (layout не трогаем): дуга серого кольца плывёт (только locked), три волны активации расходятся один раз (≤ ×1,7, ≈ 0,8 с суммарно)', () => {
    const all = [...frames(stateCss), ...frames(ringCss), ...frames(wavesCss)]
    expect(all.map(f => f[1]).sort()).toEqual(['sayActWave', 'sayRingSpin'])
    const act = strip(wavesCss).match(/@keyframes sayActWave[\s\S]*?\n\}/)[0]
    expect(Number(act.match(/100%\s*\{\s*transform:\s*scale\(([\d.]+)\)/)[1])).toBeLessThanOrEqual(1.7)
    expect(act).toMatch(/0%\s*\{\s*transform: scale\(1\);\s*opacity: 0;/) // до старта и после конца волны не видно
    const w = strip(wavesCss)
    const dur = Number(w.match(/\.sayWaveClip--live \.sayActWaves i \{ animation: sayActWave ([\d.]+)s ease-out both; \}/)[1])
    const lastDelay = Number(w.match(/i:nth-child\(3\) \{ animation-delay: ([\d.]+)s; \}/)[1])
    expect(dur + lastDelay).toBeGreaterThanOrEqual(0.6)
    expect(dur + lastDelay).toBeLessThanOrEqual(0.9)     // эффект активации ≈ 600–900 мс
    expect(w).not.toMatch(/animation:[^;]*infinite/)     // одноразовый: бесконечных волн нет совсем
    for (const [, name, body] of all) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map(m => m[1]).filter(p => p !== 'animation-timing-function')
      expect(props.every(p => ['transform', 'opacity'].includes(p)), name).toBe(true)
    }
  })

  it('надпись над кругом: небольшой серый текст, ячейка грида с кросс-фейдом (opacity + scale, как .feedTrSwap), высота постоянна; помещается на 320 px', () => {
    const cap = css.match(/\.sayCaption \{[^}]*\}/)[0]
    expect(cap).toContain("font-family: 'Montserrat', 'Comfortaa', sans-serif")
    expect(cap).toMatch(/font-size: 14px/) // было 16–19 px; на 320 px самая длинная надпись ≈ 220 px при ширине 288
    expect(cap).toMatch(/font-weight: 600/)
    expect(cap).toMatch(/line-height: 26px/)
    expect(cap).toMatch(/color: #8c93a8/)  // приглушённый серый (как .sayLink), а не белый
    expect(cap).toMatch(/display: grid/)
    expect(cap).toMatch(/white-space: nowrap/)
    const text = css.match(/\.sayCaptionText \{[^}]*\}/)[0]
    expect(text).toMatch(/grid-area: 1 \/ 1/)
    expect(text).toMatch(/transition: opacity 240ms ease, transform 240ms ease/)
    expect(css).toMatch(/\.sayCaptionText--on \{ opacity: 1; transform: none; \}/)
    expect(strip(css)).not.toMatch(/\.sayCaption[^{]*\{[^}]*(display: none|visibility)/) // место не схлопывается
    expect(css).toMatch(/\.sayCaptionLive \{[^}]*clip: rect\(0 0 0 0\)/)                  // aria-live-элемент виден только скринридеру
  })

  it('волны: два слоя по три круглых кольца размером с круг записи (115); в покое волн нет вообще; волны активации играют по появлению --live, эквалайзер показывается в --live; у колец эквалайзера НЕТ transition/animation', () => {
    const code = strip(wavesCss)
    expect(code).toMatch(/\.sayWaveAnchor \{[^}]*top: 114px; width: 115px; height: 115px; margin: -57\.5px 0 0 -57\.5px/) // 11 + 53 + 50: центр круга
    expect(CIRCLE_R * 2).toBe(115)
    expect(code).toMatch(/\.sayActWaves i, \.sayEq i \{[^}]*border-radius: 50%/)
    expect(code).toMatch(/\.sayActWaves i \{ opacity: 0; \}/)                  // вне записи волн не видно
    expect(code).toMatch(/\.sayWaveClip--live \.sayActWaves i \{ animation: sayActWave \.6s ease-out both; \}/)
    expect(code).toMatch(/\.sayWaveClip--live \.sayActWaves i:nth-child\(2\) \{ animation-delay: \.1s; \}/)
    expect(code).toMatch(/\.sayWaveClip--live \.sayEq \{ opacity: 1; transition-duration: \.1s; \}/) // эквалайзер проявляется за 100 мс, не ждёт конца активации
    expect(code).not.toMatch(/sayIdleWaves|sayWaveClip--(calm|idle)/)             // искусственных волн покоя больше нет
    for (const [rule] of code.matchAll(/\.sayEq i[^{]*\{[^}]*\}/g)) expect(rule, rule).not.toMatch(/transition|animation/)
    expect(code).toMatch(/\.sayEq \{ opacity: 0; transition: opacity \.25s; \}/) // transition только у слоя-контейнера и только по opacity
    const stage = panelSrc['SayStage.jsx']
    expect((stage.replace(/\/\/.*$/gm, '').match(/<i \/>/g) ?? []).length).toBe(RING_COUNT * 2)
    const jsx = stage.replace(/\/\/.*$/gm, '')
    expect(jsx.indexOf('sayWaveClip')).toBeLessThan(jsx.indexOf('<SayCaption')) // слой волн лежит под надписью и кнопкой
    expect(jsx.indexOf('<SayCaption')).toBeLessThan(jsx.indexOf('sayMicBox'))
    expect(jsx).toContain('sayMicBox sayMicBox--${state}')
  })

  it('волны не выходят за модуль: клип размером с содержимое панели обрезает всё лишнее, касания не принимает; предел радиуса (RING_K × круг) укладывается в половину панели', () => {
    const clip = strip(wavesCss).match(/\.sayWaveClip \{[^}]*\}/)[0]
    expect(clip).toMatch(/overflow: hidden/)
    expect(clip).toMatch(/pointer-events: none/)
    expect(clip).toMatch(/top: -11px;\s*bottom: -12px;\s*left: -16px;\s*right: -16px/) // края .phraseInner (padding 11 16 12)
    expect(Math.max(...RING_K) * CIRCLE_R + CIRCLE_R).toBeLessThanOrEqual(90) // 78 px против 115 до верха/низа панели 230/2: клип — лишь страховка
    expect(panelSrc['SayStage.jsx']).toContain('aria-hidden="true" data-testid="say-waves"')
  })

  it('«уменьшить движение»: без пружины, вращения дуги и волн активации — только смена цветов и размера; эквалайзер без JS-цикла (статичный круг)', () => {
    const media = strip(wavesCss).slice(strip(wavesCss).indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(media).toMatch(/\.sayWaveClip--live \.sayActWaves i \{ animation: none; \}/)
    expect(media).toMatch(/\.sayEq i \{ transform: scale\(1\.2\) !important; opacity: \.3 !important; \}/)
    const st = strip(stateCss)
    const stMedia = st.slice(st.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(stMedia).toMatch(/\.sayMicBox--active \.sayMicBtn \{ transition: background \.2s, border-color \.2s, color \.2s, opacity \.2s; \}/) // размер сразу, без перехода
    expect(strip(micCss)).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sayPanel \.sayMicBtn \{ transition: background \.2s, border-color \.2s, color \.2s, opacity \.2s; \}/)
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
