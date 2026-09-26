import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Всплывающее из плеера порталом в body (меню ячейки таблицы, полноэкранное
// видео) обязано лечь выше ВСЕХ экранов, где живёт плеер: урок (200),
// повторение и предпросмотр карточки (.reviewScreen), слой перехода по ссылке
// (.lessonNavOverlay). Было 241/251 — в повторении меню «he/she/it»
// открывалось под экраном и не нажималось
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const zOf = (css, selector) => {
  const block = css.split(`${selector} {`)[1]?.split('}')[0] ?? ''
  return Number(block.match(/z-index:\s*(\d+)/)?.[1])
}

const screens = [
  zOf(read('../../styles/review.css'), '.reviewScreen'),
  zOf(read('../../styles/lesson-nav-overlay.css'), '.lessonNavOverlay'),
  zOf(read('../../styles/player/layout.css'), '.lessonPlayer') || 200,
]
const top = Math.max(...screens)

describe('слои всплывающего из плеера', () => {
  it('экраны найдены', () => {
    expect(screens.every(z => z > 0)).toBe(true)
  })

  it('меню ячейки таблицы — выше всех экранов', () => {
    const css = read('../../styles/player/panels/table-manual.css')
    expect(zOf(css, '.cellMenuOverlay')).toBeGreaterThan(top)
    expect(zOf(css, '.cellMenu')).toBeGreaterThan(zOf(css, '.cellMenuOverlay'))
  })

  it('полноэкранное видео — выше всех экранов (CSS и стили в коде)', () => {
    expect(zOf(read('../../styles/player/modules/video.css'), '.videoFsBg')).toBeGreaterThan(top)
    const jsx = read('./modules/video/useVideoFullscreen.jsx')
    const inline = [...jsx.matchAll(/zIndex:\s*(?:fsVisible \? )?(\d+)/g)].map(m => Number(m[1]))
    expect(inline).toHaveLength(3)
    expect(Math.min(...inline)).toBeGreaterThan(top)
  })
})
