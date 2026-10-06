import { describe, it, expect } from 'vitest'
import { isNodeWarm } from './preloadWarm.js'

const photo  = { id: 'p', nodeType: 'photo' }
const audio  = { id: 'a', nodeType: 'audio' }
const circle = { id: 'c', nodeType: 'circle' }

describe('isNodeWarm', () => {
  it('нода без файлов прогрета сразу', () => {
    expect(isNodeWarm([], {})).toBe(true)
  })

  it('файл ещё не в очереди/не скачан — не прогрета', () => {
    expect(isNodeWarm([photo], {})).toBe(false)
    expect(isNodeWarm([photo], { p: { blobUrl: null } })).toBe(false)
  })

  it('фото: достаточно blob', () => {
    expect(isNodeWarm([photo], { p: { blobUrl: 'blob:1' } })).toBe(true)
  })

  it('голосовое: blob + посчитанная мета', () => {
    expect(isNodeWarm([audio], { a: { blobUrl: 'blob:1' } })).toBe(false)
    expect(isNodeWarm([audio], { a: { blobUrl: 'blob:1', metaDone: true } })).toBe(true)
  })

  it('кружок: blob + постер (или захват отработал впустую)', () => {
    expect(isNodeWarm([circle], { c: { blobUrl: 'blob:1' } })).toBe(false)
    expect(isNodeWarm([circle], { c: { blobUrl: 'blob:1', posterUrl: 'blob:p' } })).toBe(true)
    expect(isNodeWarm([circle], { c: { blobUrl: 'blob:1', posterDone: true } })).toBe(true)
  })

  it('ошибка загрузки или выгрузка — ждать нечего', () => {
    expect(isNodeWarm([audio], { a: { error: true } })).toBe(true)
    expect(isNodeWarm([circle], { c: { blobUrl: null, posterUrl: 'blob:p', evicted: true } })).toBe(true)
  })

  it('несколько файлов (выбери фото): все должны быть готовы', () => {
    const items = [{ id: '1', nodeType: 'photo_choice' }, { id: '2', nodeType: 'photo_choice' }]
    expect(isNodeWarm(items, { 1: { blobUrl: 'b' } })).toBe(false)
    expect(isNodeWarm(items, { 1: { blobUrl: 'b' }, 2: { blobUrl: 'b' } })).toBe(true)
  })
})
