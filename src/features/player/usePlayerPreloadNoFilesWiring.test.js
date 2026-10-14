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

  it('usePlayerPreload: пустая таблица files не блокирует закачку, только если вся очередь ключена URL (обычные уроки — как раньше)', () => {
    const src = readFileSync(fileURLToPath(new URL('./usePlayerPreload.js', import.meta.url)), 'utf8')
    expect(src).toContain('queueRef.current.length && (files.length || queueRef.current.every(')
    expect(src).toContain('https?:')
  })
  it('ключи очереди r2Url-нод начинаются с http', () => {
    const nodes = [{ id: 'a', seq: 1, type: 'audio', typeData: { audio: { r2Url: 'https://cdn.example/a.mp3' } }, triggers: [] }]
    expect(buildItemQueue(nodes, [], MEDIA).every(i => /^https?:/i.test(String(i.id)))).toBe(true)
  })
})
