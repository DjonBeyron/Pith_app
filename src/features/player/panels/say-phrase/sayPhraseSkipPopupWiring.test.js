import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка кнопки-иконки «Я не могу говорить» (SayActions + say-phrase.css) и попапа перед записью (SayMicPopup + say-phrase-popup.css).
// Остальное — sayPhraseWiring.test.js / sayPhraseCssWiring.test.js; логика выбора вида попапа — sayPermissionIntro.test.js
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))
const strip = c => c.replace(/\/\*[\s\S]*?\*\//g, '')
const css = strip(read('../../../../styles/player/panels/say-phrase.css'))
const popupCss = strip(read('../../../../styles/player/panels/say-phrase-popup.css'))
const actions = panelSrc['SayActions.jsx']
const popup = panelSrc['SayMicPopup.jsx']

describe('«Я не могу говорить» — кнопка-иконка', () => {
  it('без текста: SkipForward, aria-label и title «Я не могу говорить», тот же обработчик onSkip и data-testid; текстовой ссылки (saySkipLink) больше нет', () => {
    const jsx = actions.replace(/\/\/.*$/gm, '')
    expect(jsx).toContain("import { Volume2, Mic, SkipForward } from 'lucide-react'")
    expect(jsx).toContain('aria-label={CANT_SPEAK_LINK}')
    expect(jsx).toContain('title={CANT_SPEAK_LINK}')
    expect(jsx).toContain('onClick={onSkip}')
    expect(jsx).toContain('data-testid="say-skip"')
    expect(jsx).toContain("saySkipBtn${hideSkip ? ' saySkipBtn--hidden' : ''}")
    expect(jsx).not.toMatch(/>\s*\{CANT_SPEAK_LINK\}\s*</) // подписи на самой кнопке нет
    for (const [name, src] of Object.entries(panelSrc)) expect(src, name).not.toContain('saySkipLink')
    expect(css).not.toContain('saySkipLink')
  })

  it('круглая ≈38px, приглушённая, в ПРАВОМ углу чуть выше нижнего ряда; зона касания ≥ 44px (::after)', () => {
    const btn = css.match(/\.saySkipBtn \{[^}]*\}/)[0]
    const w = Number(btn.match(/width: (\d+)px/)[1])
    expect(w).toBeGreaterThanOrEqual(36)
    expect(w).toBeLessThanOrEqual(40)
    expect(btn).toMatch(new RegExp(`height: ${w}px`))
    expect(btn).toMatch(/border-radius: 50%/)
    expect(btn).toMatch(/position: absolute;\s*right: 0;\s*bottom: (\d+)px/)
    expect(Number(btn.match(/bottom: (\d+)px/)[1])).toBeGreaterThan(24) // выше строки «Послушать» (ряд высотой 30px)
    expect(Number(btn.match(/opacity: ([\d.]+)/)[1])).toBeLessThanOrEqual(0.85) // приглушена, не спорит с кругом
    const inset = Number(css.match(/\.saySkipBtn::after \{ content: ''; position: absolute; inset: -(\d+)px; \}/)[1])
    expect(w + inset * 2).toBeGreaterThanOrEqual(44)
  })

  it('плавно гаснет на время записи (opacity ≈ 180 мс), место не схлопывается, касания не принимает; в Firefox чуть заметнее; админская палочка — слева', () => {
    expect(css).toMatch(/transition: opacity \.18s/)
    expect(css).toMatch(/\.saySkipBtn\.saySkipBtn--hidden \{ opacity: 0; pointer-events: none; \}/)
    expect(css).not.toMatch(/saySkipBtn--hidden[^}]*(display|height|visibility)/)
    expect(css).toMatch(/\.sayBody--noMic \.saySkipBtn \{[^}]*opacity: 1;/)
    expect(css).toMatch(/\.sayFoot \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/) // «Послушать» и «Включить»; иконка вынута из сетки (absolute)
    expect(css).toMatch(/\.sayFoot \{[^}]*bottom: -12px/) // нижний ряд как раньше
    expect(panelSrc['SayPhrasePanel.jsx']).toContain('hideSkip={hideSkip}')
    expect(panelSrc['SayPhrasePanel.jsx']).toContain('<SolveCorrectButton side="left"')
    expect(read('../../../../styles/player/admin-solve.css')).toMatch(/\.solveCorrectBtn--left \{ right: auto; left: 8px; \}/)
  })

  it('Firefox: пояснение оставляет место иконке (bottom ≥ высоты зоны иконки), «Включить» на месте', () => {
    const note = css.match(/\.sayBrowserNote \{[^}]*\}/)[0]
    expect(Number(note.match(/bottom: (\d+)px/)[1])).toBeGreaterThanOrEqual(50)
    expect(actions).toContain('aria-label="Включить микрофон"')
  })
})

describe('попап перед записью — три вида и мини-иконка', () => {
  it('тексты по виду (full / short / intro) из sayTexts.js; неизвестный вид = full; data-kind отдаёт вид', () => {
    expect(popup).toMatch(/full: \{ title: EXPLAIN_TITLE, lines: EXPLAIN_LINES, btn: EXPLAIN_BTN \}/)
    expect(popup).toMatch(/short: \{ title: EXPLAIN_SHORT_TITLE, lines: EXPLAIN_SHORT_LINES, btn: EXPLAIN_SHORT_BTN \}/)
    expect(popup).toMatch(/intro: \{ title: INTRO_TITLE, lines: INTRO_LINES, btn: INTRO_BTN \}/)
    expect(popup).toContain('TEXTS[kind] ? kind : \'full\'')
    expect(popup).toContain('data-kind={k}')
    expect(panelSrc['SayPhrasePanel.jsx']).toContain('<SayMicPopup kind={sp.explainKind}')
  })

  it('строка про «Я не могу говорить» с мини-иконкой (та же SkipForward) есть во всех видах; для скринридера — скрытая подпись «Я не могу говорить»', () => {
    expect(popup).toContain("import { Mic, SkipForward } from 'lucide-react'")
    expect(popup).toContain('<SkipForward size={13}')
    expect(popup).toContain('EXPLAIN_CANT[0]')
    expect(popup).toContain('EXPLAIN_CANT[1]')
    expect(popup).toContain('EXPLAIN_CANT[2]')
    expect(popupCss).toMatch(/\.sayPopNoBreak \{ white-space: nowrap; \}/) // иконка и тире не расходятся по строкам
    expect(popup).toContain('data-testid="say-pop-cant"')
    expect(popup).toMatch(/className="sayPopSr">«\{CANT_SPEAK_LINK\}»/)
    expect(popup).toMatch(/className="sayPopCantIcon" aria-hidden="true"/)
    expect(popupCss).toMatch(/\.sayPopSr \{[^}]*clip: rect\(0 0 0 0\)/)
  })

  it('вёрстка в духе «Временной памяти»: заголовок 16/800, вводная 13px приглушённая, блоки #1b1f26 с полоской слева; значок микрофона в кружке; кнопки как раньше', () => {
    expect(popupCss).toMatch(/\.sayPopTitle \{[^}]*font-size: 16px;[^}]*font-weight: 800/)
    expect(popupCss).toMatch(/\.sayPopText \{[^}]*font-size: 13px;[^}]*color: #aeb6bf/)
    expect(popupCss).toMatch(/\.sayPopBlock \{[^}]*border-radius: 12px;[^}]*border-left: 3px solid #b6fe3b;[^}]*background: #1b1f26/)
    expect(popupCss).toMatch(/\.sayPopCantIcon \{[^}]*border-radius: 50%/)
    expect(popup).toContain('<Mic size={24} />')
    expect(popup).toMatch(/className="phraseCheckBtn sayPopBtn" onClick=\{onConfirm\}/)
    expect(popup).toMatch(/className="sayPopLater" onClick=\{onCancel\}/)
  })
})
