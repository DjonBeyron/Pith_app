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

// Меню шапки (скорость, шестерёнка) — порталом в .lessonPlayer: в его контексте
// наложения они обязаны быть выше всего, что там лежит: панелей ответа (80),
// растушёвки низа (90), свечения (95), фото (400)
describe('меню шапки урока — выше слоёв внутри плеера', () => {
  const inPlayer = [
    zOf(read('../../styles/player/panels/choose-word.css'), '.chooseWordPanel') || 80,
    zOf(read('../../styles/player/layout.css'), '.lessonPlayer::after'),
    zOf(read('../../styles/player/audio-glow.css'), '.audioGlow') || 95,
    zOf(read('../../styles/player/modules/photo.css'), '.photoFullOverlay'),
  ]
  it('слои плеера найдены', () => {
    expect(inPlayer.every(z => z > 0)).toBe(true)
    expect(Math.max(...inPlayer)).toBeGreaterThanOrEqual(400)
  })
  it.each([['settings-menu.css', '.smMenu'], ['volume-menu.css', '.lvMenu']])('%s %s выше фото-оверлея и всего остального', (file, sel) => {
    expect(zOf(read(`../../styles/player/${file}`), sel)).toBeGreaterThan(Math.max(...inPlayer))
  })
})

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
