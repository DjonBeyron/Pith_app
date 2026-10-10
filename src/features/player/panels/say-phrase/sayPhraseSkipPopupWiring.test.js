import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка кнопки-иконки «Я не могу говорить» (SayActions + SayCantIcon + say-phrase.css) и попапа перед записью — карточки над модулем (SayMicPopup + say-phrase-popup.css).
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
  it('без текста: значок SayCantIcon (не SkipForward), aria-label и title «Я не могу говорить», тот же обработчик onSkip и data-testid; текстовой ссылки (saySkipLink) больше нет', () => {
    const jsx = actions.replace(/\/\/.*$/gm, '')
    expect(jsx).toContain("import { Volume2, Mic } from 'lucide-react'")
    expect(jsx).toContain('<SayCantIcon size={24} />')
    for (const [name, src] of Object.entries(panelSrc)) expect(src.replace(/\/\/.*$/gm, ''), name).not.toContain('SkipForward')
    expect(jsx).toContain('aria-label={CANT_SPEAK_LINK}')
    expect(jsx).toContain('title={CANT_SPEAK_LINK}')
    expect(jsx).toContain('onClick={onSkip}')
    expect(jsx).toContain('data-testid="say-skip"')
    expect(jsx).toContain("saySkipBtn${hideSkip ? ' saySkipBtn--hidden' : ''}")
    expect(jsx).not.toMatch(/>\s*\{CANT_SPEAK_LINK\}\s*</) // подписи на самой кнопке нет
    for (const [name, src] of Object.entries(panelSrc)) expect(src, name).not.toContain('saySkipLink')
    expect(css).not.toContain('saySkipLink')
  })

  it('круглая ≈38px, приглушённая, в ПРАВОМ углу на уровне нижнего ряда (на 12px ниже прежнего); зона касания ≥ 44px (::after)', () => {
    const btn = css.match(/\.saySkipBtn \{[^}]*\}/)[0]
    const w = Number(btn.match(/width: (\d+)px/)[1])
    expect(w).toBeGreaterThanOrEqual(36)
    expect(w).toBeLessThanOrEqual(40)
    expect(btn).toMatch(new RegExp(`height: ${w}px`))
    expect(btn).toMatch(/border-radius: 50%/)
    expect(btn).toMatch(/position: absolute;\s*right: 0;\s*bottom: (\d+)px/)
    // опущена на 12px (было bottom 28 → стало 16; допуск 10–14): низ иконки внутри тела панели (206px) с запасом до нижнего края корпуса, на 320×568 не налезает на край и на «Послушать» (слева)
    const bottom = Number(btn.match(/bottom: (\d+)px/)[1])
    expect(28 - bottom).toBeGreaterThanOrEqual(10)
    expect(28 - bottom).toBeLessThanOrEqual(14)
    const FOOT_BOTTOM = 12 // .sayFoot { bottom: -12px }
    const bodyBottomGap = bottom - FOOT_BOTTOM
    expect(bodyBottomGap).toBeGreaterThanOrEqual(0)                          // не ниже тела панели
    expect(206 - bodyBottomGap - w).toBeGreaterThan(152)                     // и не выше прежнего, не заходит на круг записи (низ круга ×1,15 ≈ 152px от верха тела)
    expect(bottom - FOOT_BOTTOM + 12 + 1).toBeGreaterThanOrEqual(12)         // до нижнего края панели (корпус 12 + рамка 1) ≥ 12px
    expect(css).toMatch(/\.sayFootSide--end \{[^}]*padding-right: 46px/)    // «Включить» (режим «не могу говорить») встаёт левее иконки, а не под неё
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

  it('строка про «Я не могу говорить» с мини-иконкой (тот же SayCantIcon) есть во всех видах; для скринридера — скрытая подпись «Я не могу говорить»', () => {
    expect(popup).toContain("import { Mic } from 'lucide-react'")
    expect(popup).toContain('<SayCantIcon size={17}')
    expect(popup).toContain('EXPLAIN_CANT[0]')
    expect(popup).toContain('EXPLAIN_CANT[1]')
    expect(popup).toContain('EXPLAIN_CANT[2]')
    expect(popupCss).toMatch(/\.sayPopNoBreak \{ white-space: nowrap; \}/) // «на [иконка] в» не расходятся по строкам
    expect(popup).toContain('data-testid="say-pop-cant"')
    expect(popup).toMatch(/className="sayPopSr">«\{CANT_SPEAK_LINK\}»/)
    expect(popup).toMatch(/className="sayPopCantIcon" aria-hidden="true"/)
    expect(popupCss).toMatch(/\.sayPopSr \{[^}]*clip: rect\(0 0 0 0\)/)
  })

  it('воздух в карточке (решение владельца): отступы ≥20px, зазоры между блоками 14–18px, кнопки ≥48px, межстрочный ≥1,45, «Не сейчас» отдельно от основной; на узких экранах (<360px) зазоры не меньше 14', () => {
    const card = popupCss.match(/\.sayPopCard \{[^}]*\}/)[0]
    expect(card).toMatch(/gap: 16px;/)
    expect(card).toMatch(/padding: 22px 20px 20px;/)
    expect(popupCss).toMatch(/\.sayPopBody \{[^}]*gap: 14px;/)
    expect(popupCss).toMatch(/\.sayPopText \{[^}]*line-height: 1\.5;/)
    expect(popupCss).toMatch(/\.sayPopBlock \{[^}]*padding: 12px 14px;[^}]*line-height: 1\.5;/)
    expect(popupCss).toMatch(/\.sayPopActions \{[^}]*gap: 14px;/)
    expect(popupCss).toMatch(/\.sayPopActions \.sayPopBtn \{[^}]*height: 48px;/)
    expect(popupCss).toMatch(/\.sayPopLater \{[^}]*min-height: 48px;/)
    const narrow = popupCss.match(/@media \(max-width: 359px\) \{[\s\S]*?\n\}/)[0]
    expect(narrow).toMatch(/\.sayPopCard \{ gap: 14px; padding: 20px 20px 18px; \}/)
    expect(narrow).toMatch(/\.sayPopTitle \{ font-size: 14px; \}/) // заголовок в одну строку, карточка 320×568 не упирается в верх
  })

  it('вёрстка компактной карточки: значок микрофона и заголовок 15/800 в одной строке, текст 13px приглушённый, блок про «не могу говорить» #1b1f26 с полоской слева; кнопки как раньше', () => {
    expect(popupCss).toMatch(/\.sayPopTitle \{[^}]*font-size: 15px;[^}]*font-weight: 800/)
    expect(popupCss).toMatch(/\.sayPopText \{[^}]*font-size: 14px;[^}]*line-height: 1\.5;[^}]*color: #aeb6bf/)
    expect(popupCss).toMatch(/\.sayPopBlock \{[^}]*border-radius: 12px;[^}]*border-left: 3px solid #b6fe3b;[^}]*background: #1b1f26/)
    expect(popupCss).toMatch(/\.sayPopCantIcon \{[^}]*border-radius: 50%/)
    expect(popupCss).toMatch(/\.sayPopHead \{ display: flex; align-items: center;/)
    expect(popup).toContain('<Mic size={16} />')
    expect(popup).toMatch(/className="phraseCheckBtn sayPopBtn" onClick=\{onConfirm\}/)
    expect(popup).toMatch(/className="sayPopLater" onClick=\{onCancel\}/)
  })
})

describe('иконка «Я не могу говорить» — речевой пузырь с косой чертой', () => {
  const icon = panelSrc['SayCantIcon.jsx']
  const code = icon.replace(/\/\/.*$/gm, '')

  it('инлайн-SVG: тонкая линия 1.75–2.2, скруглённые концы, БЕЗ заливок, цвет только currentColor; пузырь + одна косая черта; не микрофон', () => {
    expect(code).toContain('fill="none"')
    expect(code).toContain('stroke="currentColor"')
    expect(code).toContain('strokeLinecap="round"')
    expect(code).toContain('strokeLinejoin="round"')
    expect(code).toContain('viewBox="0 0 24 24"')
    expect(Number(code.match(/strokeWidth = ([\d.]+)/)[1])).toBeGreaterThanOrEqual(1.75)
    expect(Number(code.match(/strokeWidth = ([\d.]+)/)[1])).toBeLessThanOrEqual(2)
    expect((code.match(/<path /g) ?? []).length).toBe(2)           // контур пузыря + черта
    expect(code).not.toMatch(/#[0-9a-f]{3,6}|rgb|fill="(?!none)|<rect|<circle/i) // ни цветов, ни заливок, ни микрофонной капсулы
    expect(code).toContain('aria-hidden="true"')                      // подпись — у кнопки (aria-label), сама иконка декоративна
  })

  it('одна и та же иконка стоит на кнопке (SayActions) и в строке попапа (SayMicPopup); размер на кнопке 24px', () => {
    expect(actions).toContain("import SayCantIcon from './SayCantIcon.jsx'")
    expect(popup).toContain("import SayCantIcon from './SayCantIcon.jsx'")
    expect(popupCss).toMatch(/\.sayPopCantIcon \{[^}]*width: 24px;[^}]*height: 24px/) // мини-кружок 24px, значок 17px внутри
  })
})

describe('попап над модулем — расположение и закрытие', () => {
  it('внутри панели (не портал), абсолютно НАД ней: bottom 100% + зазор, с краёв ≥ 12px, ширина ≤ 340px, касания ловит только карточка; хвостик-стрелка вниз', () => {
    const root = popupCss.match(/\.sayPopRoot \{[^}]*\}/)[0]
    expect(root).toMatch(/position: absolute;/)
    expect(root).toMatch(/bottom: calc\(100% \+ 12px\)/)
    expect(root).toMatch(/padding: 0 12px/)
    expect(root).toMatch(/pointer-events: none/)
    expect(popupCss).toMatch(/\.sayPopCard \{[^}]*width: min\(100%, 340px\)[^}]*pointer-events: auto/)
    expect(popupCss).toMatch(/\.sayPopTail \{[^}]*transform: rotate\(45deg\)/)
    expect(popup).not.toContain('createPortal')
    const panel = panelSrc['SayPhrasePanel.jsx']
    expect(panel.indexOf('<SayMicPopup')).toBeGreaterThan(panel.indexOf('className={`phrasePanel sayPanel'))
    expect(popupCss).not.toMatch(/position: fixed|sayPopDim/) // затемнения и фиксированного слоя нет
  })

  it('закрытие: «Не сейчас», Esc и тап мимо карточки (pointerdown на документе, и сам тап, и следующий click глушатся); ничего не просим', () => {
    expect(popup).toContain("document.addEventListener('pointerdown', onDown, true)")
    expect(popup).toContain('cardRef.current?.contains(e.target)')
    expect(popup).toContain("document.addEventListener('click', swallow, { capture: true, once: true })")
    expect(popup).toContain("e.key === 'Escape'")
    expect(popup).toMatch(/className="sayPopLater" onClick=\{onCancel\}/)
  })

  it('появление — пружинка, без анимации при prefers-reduced-motion; блокировка разблокировки звука сохранена', () => {
    expect(popupCss).toContain('animation: popSpringIn 0.45s backwards')
    expect(popupCss).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.sayPopCard \{ animation: none; \}/)
    expect(popup).toContain('data-no-unlock=""')
  })
})

describe('автопоказ попапа: проводка', () => {
  const panel = panelSrc['SayPhrasePanel.jsx']
  const auto = panelSrc['useSayAutoPopup.js']
  const hook = panelSrc['useSayPhrase.js']

  it('панель отдаёт хуку решение autoPopupWanted (панель показана, не закрывается, фаза, нажатия, вид кнопки, sayPermission.decide()) и openExplain', () => {
    expect(panel).toContain('useSayAutoPopup({ visible: show, phase, open: sp.openExplain')
    expect(panel).toContain('autoPopupWanted({ visible: show, closing, phase, taps: sp.taps, micState: micTarget, decision: sp.perm.decide() })')
  })

  it('хук: один таймер на секунду от появления модуля (autoPopupDelay), чистится при размонтировании и потере условий, один раз за монтирование; микрофон не трогает', () => {
    const c = auto.replace(/\/\/.*$/gm, '')
    expect(c).toContain('autoPopupDelay(nowMs() - sinceRef.current)')
    expect(c).toContain('return () => clearTimeout(t)')
    expect(c).toContain("if (phase !== 'idle') doneRef.current = true")
    expect(c).toMatch(/doneRef\.current = true; openRef\.current\?\.\(\)/)
    expect(c).not.toMatch(/getUserMedia|\.start\(|begin\(|tapMic|confirmExplain/)
  })

  it('openExplain только ПОКАЗЫВАЕТ попап (dispatch explain того же вида, что и тап): начало записи — по-прежнему confirmExplain из кнопки внутри попапа', () => {
    const body = hook.match(/const openExplain = useCallback\(\(\) => \{[\s\S]*?\}, \[perm\]\)/)[0]
    expect(body).toContain("stateRef.current.phase !== 'idle'")
    expect(body).toContain("dispatch({ type: 'explain', kind: d.kind })")
    expect(body).not.toMatch(/begin\(|ctrl\./)
    expect(hook).toMatch(/const confirmExplain = useCallback\(\(\) => \{ perm\.markExplained\(\); perm\.markIntroSeen\(\); perm\.markPreShown\(\); begin\(\) \}/)
  })
})
