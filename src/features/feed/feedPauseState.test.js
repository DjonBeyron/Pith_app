import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getFeedPaused, setFeedPaused } from './feedPauseState.js'

describe('общая пауза «Рекомендаций» и «Моих уроков»', () => {
  it('одно значение на обе ленты, функциональное обновление', () => {
    setFeedPaused(false)
    setFeedPaused(p => !p)
    expect(getFeedPaused()).toBe(true)
    setFeedPaused(false)
    expect(getFeedPaused()).toBe(false)
  })

  it('SlideVideo берёт паузу из общего состояния и сбрасывает её только при уходе со слайда', () => {
    const src = readFileSync(fileURLToPath(new URL('./SlideVideo.jsx', import.meta.url)), 'utf8')
    expect(src).toContain('const [paused, setPaused] = useFeedPaused()')
    expect(src).toContain('if (wasActiveRef.current && !active && getFeedPaused()) setPaused(false)')
  })
})
