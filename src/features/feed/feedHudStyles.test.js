import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Страж худа ленты: без подложек и теней (оптимизация), иконки — силуэты (залиты), «поп» при нажатии — только transform
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const css = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, '') // без комментариев — в них слова про запрет
const hud = css('../../styles/feed-hud.css')
const diff = css('../../styles/difficulty.css')
const search = css('../../styles/feed-search.css')
const hudJsx = read('./FeedHud.jsx')
const earJsx = read('./DifficultyBadge.jsx')
const block = (src, sel) => src.match(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{[^}]*\\}`))?.[0] ?? ''

describe('худ ленты: без подложек и теней', () => {
  it('нет filter / text-shadow / box-shadow / backdrop-filter', () => {
    expect(hud).not.toMatch(/drop-shadow|filter\s*:|text-shadow|box-shadow|backdrop-filter|blur\(/)
  })
  it('у кнопки нет фона и скругления-плашки, а зона касания ≥44px — через ::before', () => {
    const btn = block(hud, '.feedHudBtn')
    expect(btn).toMatch(/background: none/)
    expect(btn).not.toMatch(/border-radius/)
    expect(block(hud, '.feedHudBtn::before')).toMatch(/inset: -10px/) // 25px + 2×10 = 45
  })
})

describe('худ ленты: иконки — силуэты', () => {
  it('общий класс feedHudIcon: заливка currentColor + тонкий обвод через paint-order', () => {
    const icon = block(hud, '.feedHudIcon')
    expect(icon).toMatch(/fill: currentColor/)
    expect(icon).toMatch(/stroke: rgba\(0, 0, 0, 0\.45\)/)
    expect(icon).toMatch(/paint-order: stroke/)
  })
  it('сердце, закладка, репост залиты и не зависят от состояния; ухо — svg с feedHudIcon', () => {
    expect(hudJsx).not.toMatch(/fill=\{[^}]*\? 'currentColor' : 'none'\}/)
    expect(hudJsx).toMatch(/<Heart className="feedHudIcon" fill="currentColor"/)
    expect(hudJsx).toMatch(/<Bookmark className="feedHudIcon" fill="currentColor"/)
    expect(hudJsx).toMatch(/<svg className="feedHudIcon"[^>]*fill="currentColor"/)
    expect(earJsx).toMatch(/<svg className=\{`feedHudIcon diffEarIcon/)
    expect(earJsx).not.toMatch(/\bEar\b.*lucide/)
  })
  it('состояния различаются цветом: лайк красный, закладка лаймовая', () => {
    expect(block(hud, '.feedHudBtnLikeOn')).toMatch(/color: #ff6a6a/)
    expect(block(hud, '.feedHudBtnSaveOn')).toMatch(/color: #b6fe3b/)
  })
  it('динамик «без звука» залит, лупа поиска залита слегка (круг), ножка не трогается', () => {
    expect(read('./SlideVideo.jsx')).toMatch(/<VolumeX fill="currentColor" \/>/)
    expect(read('./FeedTabsHeader.jsx')).toMatch(/<VolumeX fill="currentColor" \/>/)
    expect(block(search, '.feedSearchBtn svg circle')).toMatch(/fill-opacity: 0\.35/)
    expect(search).not.toMatch(/svg path/)
  })
  it('внутренняя завитушка уха — тёмная вырезка без заливки', () => {
    expect(block(diff, '.diffEarCut')).toMatch(/fill: none/)
  })
})

describe('худ ленты: «поп» при нажатии', () => {
  it('ухо и закладка получают feedHudBtnPop на время анимации (useTapPop)', () => {
    expect(hudJsx).toMatch(/useTapPop/)
    expect(hudJsx).toMatch(/savePop \? ' feedHudBtnPop'/)
    expect(earJsx).toMatch(/feedHudBtnPop feedHudBtnPopSelf/)
  })
  it('keyframes — только transform, 0.25–0.3 с, при «уменьшить анимации» отключено, will-change не держим', () => {
    const kf = hud.match(/@keyframes feedHudPop\s*\{[\s\S]*?\n\}/)[0]
    expect(kf).toMatch(/transform: scale/)
    expect(kf).not.toMatch(/opacity|filter|left|top|width/)
    expect(hud).toMatch(/animation: feedHudPop 0\.28s ease/)
    expect(hud).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*feedHudBtnPop[\s\S]*animation: none/)
    expect(hud).not.toMatch(/will-change/)
  })
})
