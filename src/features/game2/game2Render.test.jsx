import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Game2Lane from './Game2Lane.jsx'
import Game2Pill from './Game2Pill.jsx'
import Game2Summary from './Game2Summary.jsx'
import { buildTimeline, phraseWords, dueFlags, timingsOf, visiblePills } from './timelinePlan.js'
import { pillBox, trackY, LINE_Y } from './game2Geometry.js'
import { planFor } from '../rehearsal/rehearsalFixtures.js'
import { emptyScore, withResult } from './game2Score.js'

const plan = planFor('sim', { fixture: 'three' })
const words = phraseWords(plan)
const tl = buildTimeline({ words, due: dueFlags(words, plan), ...timingsOf(words, null) })
const view = (show, labels) => ({ key: 1, mode: 'x', pills: visiblePills(tl, show), labels })

describe('лента: разметка', () => {
  it('одна лента по центру: дорожка, линия «сейчас» на 55 %, пилюли с подписями на самих пилюлях', () => {
    const html = renderToStaticMarkup(<Game2Lane view={view('all', true)} apiRef={null} />)
    expect(html).toContain('data-testid="g2-lane"'); expect(html).toContain('data-testid="g2-track"'); expect(html).toContain('data-testid="g2-line"')
    expect(html).toContain(`--g2-line:${LINE_Y}%`); expect(html).toContain('--g2-w:66%')
    expect(html).toContain('data-labels="1"')
    for (const w of words) expect(html).toContain(`>${w.replace("'", '&#x27;')}</span>`)
    expect((html.match(/class="g2Pill"/g) ?? []).length).toBe(4)
    expect(html).not.toContain('g2TapLayer') // касание ленты — только в режиме «тап вместо речи»
  })
  it('у слова «к повтору» метка data-due; служебные слова не мельче обычных (одна высота, без data-small)', () => {
    const html = renderToStaticMarkup(<Game2Lane view={view('all', true)} apiRef={null} />)
    const pill = i => html.match(new RegExp(`<div class="g2Pill"[^>]*data-i="${i}"[^>]*>`))[0]
    expect(pill(1)).toContain('data-due="true"'); expect(pill(3)).toContain('data-due="true"')
    expect(pill(0)).not.toContain('data-due'); expect(pill(2)).not.toContain('data-small')
    expect(pill(2)).toContain('height:44px'); expect(pill(0)).toContain('height:44px')
  })
  it('«Ловлю»: только слова к повтору и ленты без подписей; промежутки — пустое место (моменты те же)', () => {
    const html = renderToStaticMarkup(<Game2Lane view={view('due', false)} apiRef={null} />)
    expect((html.match(/class="g2Pill"/g) ?? []).length).toBe(2)
    expect(html).toContain('data-labels="0"'); expect(html).not.toContain('>to</span>')
    const [a, b] = visiblePills(tl, 'due')
    expect(Math.abs(pillBox(a, 812).top - pillBox(b, 812).top)).toBeGreaterThan(40) // между ними пустой промежуток ленты
  })
  it('лента пустая в режиме «Старт»; режим тапа добавляет слой касаний', () => {
    expect(renderToStaticMarkup(<Game2Lane view={view('none', false)} apiRef={null} />)).not.toContain('g2Pill')
    expect(renderToStaticMarkup(<Game2Lane view={view('all', true)} apiRef={null} onPillTap={() => {}} />)).toContain('data-testid="g2-tap"')
  })
  it('в нулевой момент дорожка стоит на линии «сейчас»: сдвиг = 55 % высоты; пилюля лежит выше', () => {
    expect(trackY(0, 812)).toBeCloseTo(0.55 * 812)
    const box = pillBox(tl.pills[0], 812)
    expect(box.top).toBeLessThan(0)
    const html = renderToStaticMarkup(<Game2Pill p={tl.pills[0]} box={box} />)
    expect(html).toContain(`top:${box.top}px`); expect(html).toContain(`height:${box.height}px`)
  })
})

describe('итог', () => {
  it('плашка в стиле игры: поймано в «Ловлю», залито в «Тени» и «По памяти», кнопки «Ещё раз» / «Готово»', () => {
    let s = withResult(emptyScore(), 'catch', 1, 2)
    s = withResult(s, 'shadow', 4, 4); s = withResult(s, 'recall', 2, 4)
    const html = renderToStaticMarkup(<Game2Summary text="I'm trying to learn" score={s} onAgain={() => {}} onDone={() => {}} />)
    expect(html).toContain('class="wlTurn rhScreen rhSumPlate g2Sum"')
    expect(html).toContain('data-testid="g2-summary-catch">1 из 2<'); expect(html).toContain('data-testid="g2-summary-shadow">4 из 4<'); expect(html).toContain('data-testid="g2-summary-recall">2 из 4<')
    expect(html).toContain('Ещё раз'); expect(html).toContain('Готово')
  })
})
