import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { STRIP_WIDTH_PCT } from './catch/slowStripGesture.js'

// Страж CSS правой полосы замедления «Ловли слов» (feed-slow-strip.css): едет вместе с накрытием только transform'ом, на тех же
// кривых и длительности, что накрытие (feed-catch.css); без blur/filter/теней; слои; reduced-motion
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const strip = read('../../styles/feed-slow-strip.css')
const catchCss = read('../../styles/feed-catch.css')
const hud = read('../../styles/feed-hud.css')
const block = (src, sel) => src.match(new RegExp(`${sel.replace(/[.:()]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
const base = block(strip, '.feedSlowStrip')
const curveOf = (src, sel) => block(src, sel).match(/cubic-bezier\([^)]*\)/)?.[0]

describe('feed-slow-strip.css: геометрия и слои', () => {
  it('полоса — пятая часть ширины справа, на всю высоту слайда над нижней панелью', () => {
    expect(base).toMatch(new RegExp(`width:\\s*${STRIP_WIDTH_PCT}%`))
    expect(base).toMatch(/right:\s*0\b/)
    expect(base).toMatch(/top:\s*0\b/)
    expect(base).toMatch(/bottom:\s*var\(--v2-nav-h\)/)
  })

  it('нижняя граница следует за верхом накрытия: сдвиг вверх ровно на --catch-cover-h (0 при закрытом)', () => {
    expect(base).toMatch(/transform:\s*translateY\(calc\(var\(--catch-cover-h,\s*0px\)\s*\*\s*-1\)\)/)
  })

  it('под колонкой худа и накрытием: z-index меньше худа, жест не воруют прокрутка и Swiper', () => {
    const z = +base.match(/z-index:\s*(\d+)/)[1]
    expect(z).toBeLessThan(+block(hud, '.feedHud').match(/z-index:\s*(\d+)/)[1])
    expect(z).toBeLessThan(+block(catchCss, '.catchCover').match(/z-index:\s*(\d+)/)[1])
    expect(base).toMatch(/touch-action:\s*none/)
  })

  it('пока накрытие уходит (слайд без .feedSlideCatchOpen), касаний полоса не ловит', () => {
    expect(block(strip, '.feedSlide:not(.feedSlideCatchOpen) .feedSlowStrip')).toMatch(/pointer-events:\s*none/)
  })
})

describe('feed-slow-strip.css: движение синхронно с накрытием, только transform/opacity', () => {
  it('анимируется только transform, длительность — та же 260мс (--catch-icon-ms, как у иконок)', () => {
    const tr = base.match(/transition:\s*([^;]+);/)[1]
    expect(tr).toMatch(/^transform var\(--catch-icon-ms,\s*260ms\) cubic-bezier/)
    expect(tr).not.toMatch(/opacity|height|width|top|bottom|left|right/)
    expect(block(catchCss, '.catchCover')).toMatch(/transition:\s*transform 260ms/)
  })

  it('кривые те же, что у накрытия: уход (0.4,0,1,1) — база, выезд (0.22,1,0.36,1) — при .feedSlideCatchOpen', () => {
    const coverOut = curveOf(catchCss, '.catchCover')
    const coverIn = curveOf(catchCss, '.catchCoverShown')
    expect(coverOut).toBe('cubic-bezier(0.4, 0, 1, 1)')
    expect(coverIn).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
    expect(curveOf(strip, '.feedSlowStrip')).toBe(coverOut)
    expect(block(strip, '.feedSlideCatchOpen .feedSlowStrip')).toContain(`transition-timing-function: ${coverIn}`)
  })

  it('без filter / blur / теней / backdrop-filter, will-change не нужен', () => {
    expect(strip).not.toMatch(/filter|blur\(|box-shadow|text-shadow|drop-shadow|will-change/)
  })

  it('prefers-reduced-motion: перехода нет', () => {
    const rm = strip.slice(strip.indexOf('prefers-reduced-motion'))
    expect(rm).toMatch(/\.feedSlowStrip\s*\{\s*transition:\s*none/)
  })
})

describe('подсказка в полосе', () => {
  it('стоит у нижней границы полосы (над накрытием), правила перебивают базовые (селектор с .feedSlowStrip)', () => {
    const h = block(strip, '.feedSlowStrip .feedSlowHintCatch')
    expect(h).toMatch(/bottom:\s*\d+px/)
    expect(h).toMatch(/left:\s*auto/)
    expect(h).toMatch(/transform:\s*none/)
  })
})
