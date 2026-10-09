import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Страж контракта попапа игрока: затемнение — отдельный слой с анимацией ТОЛЬКО opacity
// (не фон-цвет, без blur), окно лежит поверх и не внутри анимируемого слоя; блеск плейсхолдеров
// — одна общая keyframes, только transform/opacity, статичный при «уменьшить анимации»
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const css = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, '') // без комментариев — в них слова «blur», «filter» как раз про запрет
const popup = css('../../styles/rating-popup.css')
const spring = css('../../styles/pop-spring.css')
const shimmer = css('../../styles/shimmer.css')
const jsx = read('./UserStatsPopup.jsx')
const body = read('./UserStatsBody.jsx')
const keyframes = (css, name) => css.match(new RegExp(`@keyframes ${name}\\s*\\{[^}]*\\}`))?.[0] ?? ''

describe('затемнение попапа игрока', () => {
  it('подложка — отдельный слой рядом с окном, а не фон корня', () => {
    expect(jsx).toMatch(/className=\{`rpDim/)
    expect(jsx.indexOf('rpDim')).toBeLessThan(jsx.indexOf('className={`rpCard'))
    const root = popup.match(/\.rpRoot \{[^}]*\}/)[0]
    expect(root).not.toMatch(/background/)
    expect(root).not.toMatch(/animation/)
  })
  it('анимируется только opacity: keyframes без background, нет blur/backdrop-filter', () => {
    for (const k of ['rpDimIn', 'rpDimOut']) {
      const kf = keyframes(popup, k)
      expect(kf).toMatch(/opacity: 0/)
      expect(kf).not.toMatch(/background|transform|filter/)
    }
    expect(popup).not.toMatch(/backdrop-filter|blur\(/)
  })
  it('длительность появления 0.25–0.3 с, уход 0.3 с и держит конец (forwards)', () => {
    expect(popup).toMatch(/\.rpDim \{[^}]*animation: rpDimIn 0\.2[5-9]?s ease-out backwards/)
    expect(popup).toMatch(/\.rpDim--out \{ animation: rpDimOut 0\.3s ease-out forwards/)
  })
  it('общий pop-spring больше не анимирует корень попапа целиком (иначе окно затемнялось бы вместе с ним)', () => {
    expect(spring).not.toMatch(/\.rpBack|\.rpRoot/)
  })
})

describe('блеск ещё не пришедших значений', () => {
  it('одна общая keyframes (feedSkelShine), только transform', () => {
    expect(shimmer).toMatch(/animation: feedSkelShine/)
    expect(keyframes(css('../../styles/feed-media.css'), 'feedSkelShine')).toMatch(/transform/)
    expect(shimmer).not.toMatch(/@keyframes|background-position|blur\(|filter/)
  })
  it('без анимации: «уменьшить анимации», слабое устройство, поле с пришедшими данными', () => {
    expect(shimmer).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.shim::after \{ display: none/)
    expect(shimmer).toMatch(/\.shim--still::after/)
    expect(shimmer).toMatch(/\[data-ready\] > \.shim::after/)
    expect(body).toMatch(/isWeakDevice\(\) \? 'shim shim--still' : 'shim'/)
  })
  it('вёрстка блоков не зависит от ответа: плитки, строка достижений и подвал рисуются и без данных', () => {
    expect(body).toMatch(/Stats stats=\{res\?\.stats \?\? null\}/)
    expect(body).not.toMatch(/Skeleton/)
  })
})
