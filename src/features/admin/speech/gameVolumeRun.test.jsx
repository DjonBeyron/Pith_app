import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('./gameVolumePit.js', () => ({ PIT_ID: 'race_start', MIME: {}, extOf: () => 'mp3', loadPit: () => new Promise(() => {}) }))
const { default: GameVolumeRun } = await import('./GameVolumeRun.jsx')
const { default: GameVolumeBlock } = await import('./GameVolumeBlock.jsx')

describe('Прогон громкости (экран)', () => {
  it('в начале: описание и кнопка запуска (пока грузится голос Пита — неактивна); вопросов и шагов ещё нет', () => {
    const html = renderToStaticMarkup(<GameVolumeRun />)
    expect(html).toContain('Прогон громкости')
    expect(html).toContain('Загружаю голос Пита…')
    expect(html).toMatch(/data-testid="run-begin"[^>]*disabled|disabled[^>]*data-testid="run-begin"/)
    expect(html).not.toContain('run-step')
    expect(html).not.toContain('run-ask')
  })
  it('прогон стоит в блоке «Стенд громкости» над переключателями режима микрофона', () => {
    const html = renderToStaticMarkup(<GameVolumeBlock />)
    expect(html.indexOf('game-volume-run')).toBeGreaterThan(-1)
    expect(html.indexOf('game-volume-run')).toBeLessThan(html.indexOf('vol-hold'))
  })
})
