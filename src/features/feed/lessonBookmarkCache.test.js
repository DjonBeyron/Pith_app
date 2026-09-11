import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const { readCachedBookmarks, writeCachedBookmarks } = await import('./lessonBookmarkCache.js')

describe('зеркало уроков-закладок', () => {
  beforeEach(() => store.clear())

  it('хранится отдельно для каждого аккаунта', () => {
    writeCachedBookmarks('u1', [{ id: 'l1', title: 'To' }])
    expect(readCachedBookmarks('u1')).toEqual([{ id: 'l1', title: 'To' }])
    // На общем устройстве чужие закладки не должны мелькнуть после смены входа
    expect(readCachedBookmarks('u2')).toEqual([])
  })

  it('без пользователя не читает и не пишет', () => {
    writeCachedBookmarks(undefined, [{ id: 'l1', title: 'To' }])
    expect(store.size).toBe(0)
    expect(readCachedBookmarks(undefined)).toEqual([])
  })

  it('переживает мусор в хранилище', () => {
    store.set('pithy_bm_lessons_v1:u1', '{сломано')
    expect(readCachedBookmarks('u1')).toEqual([])
    store.set('pithy_bm_lessons_v1:u1', '[null,{"title":"без id"},{"id":"l1","title":"To"}]')
    expect(readCachedBookmarks('u1')).toEqual([{ id: 'l1', title: 'To' }])
  })

  it('кладёт только id и название — лишнее в кэш не течёт', () => {
    writeCachedBookmarks('u1', [{ id: 'l1', title: 'To', pct: 42, paused: true }])
    expect(readCachedBookmarks('u1')).toEqual([{ id: 'l1', title: 'To' }])
  })
})

describe('список «Мои уроки» не дорастает после отрисовки', () => {
  const ml = read('./MyLessons.jsx')

  it('до ответа сервера показывается зеркало', () => {
    // Модули приходят готовыми пропсами, закладки — тремя запросами подряд:
    // без зеркала строка-закладка появлялась на ~100 мс позже остальных
    expect(ml).toContain('const shownBookmarks = bmLoaded ? bookmarkedLessons : readCachedBookmarks(user?.id)')
    expect(ml).toContain('const visibleLessons = shownBookmarks')
  })

  it('после ответа зеркало больше не участвует', () => {
    // Иначе удалённая на другом устройстве закладка висела бы вечно
    expect(ml).toContain('setBmLoaded(true)')
    expect(ml).toContain('writeCachedBookmarks(user?.id, list)')
  })
})
