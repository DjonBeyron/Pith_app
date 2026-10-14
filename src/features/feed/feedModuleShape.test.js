import { describe, it, expect } from 'vitest'
import { rowToFeedModule, publishedFeedModules } from './feedModuleShape.js'

// Форма модуля ленты: поле sceneId (сцена в ленте, часть A) — контракт со слайдом
describe('rowToFeedModule: sceneId', () => {
  it('есть колонка scene_id → sceneId', () => {
    const m = rowToFeedModule({ id: 'm1', title: 'Hi', scene_id: '11111111-1111-1111-1111-111111111111', video_url: 'v.mp4' })
    expect(m.sceneId).toBe('11111111-1111-1111-1111-111111111111')
    // Оба поля отдаются как есть — приоритет решает слайд
    expect(m.videoUrl).toBe('v.mp4')
  })
  it('scene_id null → sceneId null', () => {
    expect(rowToFeedModule({ id: 'm1', title: 'Hi', scene_id: null }).sceneId).toBeNull()
  })
  it('колонки нет (миграция не применена) → sceneId null, остальное как раньше', () => {
    const m = rowToFeedModule({ id: 'm1', title: 'Hi', video_url: 'v.mp4', published: true })
    expect(m.sceneId).toBeNull()
    expect(m.videoUrl).toBe('v.mp4')
    expect(m.feedCatchEnabled).toBe(true)
  })
  it('publishedFeedModules переносит sceneId и режет черновики', () => {
    const rows = [
      { id: 'a', title: 'A', published: true, scene_id: 's1' },
      { id: 'b', title: 'B', published: false, scene_id: 's2' },
    ]
    const out = publishedFeedModules(rows)
    expect(out.map(m => m.id)).toEqual(['a'])
    expect(out[0].sceneId).toBe('s1')
  })
})
