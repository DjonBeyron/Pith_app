import { describe, it, expect } from 'vitest'
import { getNodeMediaState, nodeMissesMedia, isNodeDimmed } from './nodeMediaStatus.js'

const node = (type, data) => ({ id: 'a', seq: 1, type, typeData: { [type]: data } })

describe('getNodeMediaState', () => {
  it('типы без медиа метки не получают', () => {
    for (const t of ['text', 'system', 'pin_message', 'word_choice', 'phrase_assembly', 'registration']) {
      expect(getNodeMediaState(node(t, { content: 'привет' }))).toBe(null)
    }
  })

  it('аудио/видео/фото/кружок/стикер — по наличию file_id', () => {
    for (const t of ['audio', 'video', 'photo', 'circle', 'sticker']) {
      expect(getNodeMediaState(node(t, {}))).toBe('missing')
      expect(getNodeMediaState(node(t, { file_id: 'f1' }))).toBe('ok')
    }
  })

  it('аудио к таблице необязательно — таблица без файла не считается пустой', () => {
    expect(getNodeMediaState(node('table', {}))).toBe(null)
  })

  it('photo_choice: пусто / часть / все', () => {
    expect(getNodeMediaState(node('photo_choice', { photos: [] }))).toBe('missing')
    expect(getNodeMediaState(node('photo_choice', { photos: [{ id: '1' }, { id: '2' }] }))).toBe('missing')
    expect(getNodeMediaState(node('photo_choice', {
      photos: [{ id: '1', fileId: 'f' }, { id: '2' }],
    }))).toBe('partial')
    expect(getNodeMediaState(node('photo_choice', {
      photos: [{ id: '1', fileId: 'f' }, { id: '2', fileId: 'g' }],
    }))).toBe('ok')
  })

  it('нода без typeData не падает', () => {
    expect(getNodeMediaState({ id: 'a', type: 'audio' })).toBe('missing')
  })
})

describe('nodeMissesMedia', () => {
  it('ждут файл только missing и partial', () => {
    expect(nodeMissesMedia(node('audio', {}))).toBe(true)
    expect(nodeMissesMedia(node('photo_choice', { photos: [{ id: '1', fileId: 'f' }, { id: '2' }] }))).toBe(true)
    expect(nodeMissesMedia(node('audio', { file_id: 'f' }))).toBe(false)
    expect(nodeMissesMedia(node('text', { content: 'a' }))).toBe(false)
  })
})

describe('isNodeDimmed', () => {
  const audioEmpty = node('audio', {})
  const audioFull  = node('audio', { file_id: 'f' })
  const text       = node('text', { content: 'a' })

  it('фильтр выключен — не приглушаем ничего', () => {
    expect(isNodeDimmed(audioEmpty, new Set(), false)).toBe(false)
    expect(isNodeDimmed(text, null, false)).toBe(false)
  })

  it('фильтр по типам приглушает чужие типы', () => {
    expect(isNodeDimmed(text, new Set(['audio']), false)).toBe(true)
    expect(isNodeDimmed(audioFull, new Set(['audio']), false)).toBe(false)
  })

  it('«не загруженные» оставляет только ждущие файл', () => {
    expect(isNodeDimmed(audioEmpty, new Set(), true)).toBe(false)
    expect(isNodeDimmed(audioFull, new Set(), true)).toBe(true)
    expect(isNodeDimmed(text, new Set(), true)).toBe(true)
  })

  it('оба фильтра работают вместе (И)', () => {
    expect(isNodeDimmed(audioEmpty, new Set(['audio']), true)).toBe(false)
    expect(isNodeDimmed(audioEmpty, new Set(['photo']), true)).toBe(true)
    expect(isNodeDimmed(audioFull, new Set(['audio']), true)).toBe(true)
  })
})
