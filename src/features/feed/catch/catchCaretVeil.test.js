import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const catchCss = read('../../../styles/feed-catch.css')
const stripCss = read('../../../styles/feed-catch-strip.css')
const twCss = read('../../../styles/player/panels/type-word.css')
const typedLine = read('./CatchTypedLine.jsx')
const twPanel = read('../../player/panels/type-word/TypeWordPanel.jsx')
const twKeyboard = read('../../player/panels/type-word/TypeWordKeyboard.jsx')

const rule = (css, selector) => {
  const at = css.indexOf(`${selector} {`)
  return css.slice(at, css.indexOf('}', at))
}

describe('заливка накрытия: первые 10% пути стоит на месте', () => {
  it('opacity 234ms linear с задержкой 26ms = 10% от 260мс движения, конец вместе с панелью', () => {
    expect(rule(catchCss, '.catchCoverVeil')).toContain('transition: opacity 234ms linear 26ms;')
    expect(rule(catchCss, '.catchCover')).toContain('transition: transform 260ms')
    expect(234 + 26).toBe(260)
    expect(26 / 260).toBeCloseTo(0.1, 5)
  })
  it('при prefers-reduced-motion переходов (и задержки) нет', () => {
    const reduced = catchCss.slice(catchCss.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.catchCoverVeil\s*\{\s*transition: none;/)
  })
  it('направление задаёт только класс Shown: закрыто 1, открыто 0 (одно правило перехода на оба направления)', () => {
    expect(rule(catchCss, '.catchCoverVeil')).toContain('opacity: 1;')
    expect(catchCss).toContain('.catchCoverShown .catchCoverVeil { opacity: 0; }')
  })
})

describe('курсор: сплошной при наборе, мигает после паузы', () => {
  it('курсор ловли и плеера перемонтируются по длине набранного (key)', () => {
    expect(typedLine).toContain('<i key={typed.length} className="catchCaret"')
    expect(twPanel).toContain('<span key={typed.length} className="twCaret"')
  })
  it('цикл мигания общий и начинается с сплошной фазы; у курсора нет transition на позицию', () => {
    expect(twCss).toMatch(/@keyframes twCaretBlink \{\s*0%, 55% \{ opacity: 1; \}/)
    expect(rule(stripCss, '.catchCaret')).toContain('animation: twCaretBlink 1.1s steps(1) infinite;')
    expect(rule(stripCss, '.catchCaret')).not.toContain('transition')
    expect(rule(twCss, '.twCaret')).not.toContain('transition')
  })
  it('разбор фразы строкой набранного мемоизирован и не пересчитывается на каждую букву', () => {
    expect(typedLine).toContain('useMemo(() => phraseUnits(title), [title])')
  })
  it('клавиатура реагирует на click (не pointerdown): шторка прокручивается жестом по клавишам, двойного ввода нет', () => {
    expect(twKeyboard).toContain('onClick={() => onKey(k.ch)}')
    expect(twKeyboard).not.toContain('onPointerDown')
  })
})
