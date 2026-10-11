import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildItemQueue } from './preloadQueue.js'

const MEDIA = new Set(['audio', 'video', 'circle', 'photo', 'sticker', 'photo_choice', 'table'])

describe('урок, у которого медиа-ноды со ссылкой r2Url без записей в files (импорт из JSON)', () => {
  it('очередь загрузки строится по ссылкам из нод, хотя таблица files пуста', () => {
    const nodes = [
      { id: 'a', seq: 1, type: 'circle', typeData: { circle: { r2Url: 'https://cdn.example/c.mp4' } }, triggers: [{ if: 'played', then: 'b' }] },
      { id: 'b', seq: 2, type: 'audio', typeData: { audio: { r2Url: 'https://cdn.example/a.mp3' } }, triggers: [] },
    ]
    expect(buildItemQueue(nodes, [], MEDIA).map(i => i.url)).toEqual(['https://cdn.example/c.mp4', 'https://cdn.example/a.mp3'])
  })

  it('usePlayerPreload запускает загрузку при непустой очереди и НЕ требует files.length (иначе карточка запуска висит вечно)', () => {
    const src = readFileSync(fileURLToPath(new URL('./usePlayerPreload.js', import.meta.url)), 'utf8')
    expect(src).toContain('if (queueRef.current.length) pump(gen)')
    expect(src).not.toMatch(/queueRef\.current\.length && files\.length/)
  })
})
