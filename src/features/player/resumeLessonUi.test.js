import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const dir = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(dir, p), 'utf8')

// Попап «Продолжить урок?» открывается с того же экрана, что и карточка
// запуска (LessonLaunchCard) — должен выглядеть частью того же набора:
// брендовый лайм на главной кнопке, тот же узор фона, что у .launchCard
describe('попап «Продолжить урок?» — тот же стиль, что у запуска урока', () => {
  const css = read('../../styles/player/resume-lesson.css')
  const launchCss = read('../../styles/lessons.css')

  it('главная кнопка — брендовый лайм, не generic-зелёный', () => {
    const block = css.slice(css.indexOf('.resumeLessonBtnPrimary'), css.indexOf('.resumeLessonBtnGhost'))
    expect(block).toContain('background: #b6fe3b')
    expect(block).not.toContain('#4caf50')
  })

  it('карточка — тот же узор фона, что у карточки запуска (.launchCard)', () => {
    const block = css.slice(css.indexOf('.resumeLessonCard {'), css.indexOf('.resumeLessonTitle'))
    expect(block).toContain('var(--mg-dust)')
    expect(block).toContain('var(--mg-grain)')
    expect(block).toContain('var(--mg-tex-start)')
    expect(block).toContain('var(--lesson-popup-bg)')
    // Переменные объявлены в lessons-chain-textures.css, --lesson-popup-bg — в lessons.css
    expect(launchCss).toContain('--lesson-popup-bg: #14171e')
  })
})
