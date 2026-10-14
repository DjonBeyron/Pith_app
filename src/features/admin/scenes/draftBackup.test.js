import { describe, it, expect } from 'vitest'
import { saveBackup, loadBackup, clearBackup, BACKUP_KEY, formatBackupTime } from './draftBackup.js'
import { newDraft } from './builderModel.js'

const memStorage = () => {
  const m = new Map()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m }
}

describe('резервная копия черновика', () => {
  it('save → load возвращает нормализованную сцену, savedId и время', () => {
    const s = memStorage()
    const scene = newDraft()
    expect(saveBackup({ scene, savedId: 'row-1' }, s)).toBe(true)
    const b = loadBackup(s)
    expect(b.scene).toEqual(scene)
    expect(b.savedId).toBe('row-1')
    expect(new Date(b.at).getTime()).toBeGreaterThan(0)
    expect(formatBackupTime(b.at)).toMatch(/\d{2}\.\d{2}/)
  })

  it('пусто / битый JSON / не объект → null и запись удаляется; невалидный черновик сохраняется', () => {
    const s = memStorage()
    expect(loadBackup(s)).toBeNull()
    s.setItem(BACKUP_KEY, '{oops')
    expect(loadBackup(s)).toBeNull()
    expect(s.map.has(BACKUP_KEY)).toBe(false)
    s.setItem(BACKUP_KEY, JSON.stringify({ scene: 'nope' }))
    expect(loadBackup(s)).toBeNull()
    expect(s.map.has(BACKUP_KEY)).toBe(false)
    // невалидный, но объект — черновик на полпути: возвращается нормализованным
    s.setItem(BACKUP_KEY, JSON.stringify({ scene: { version: 2, characters: { a: { name: '' } } } }))
    expect(loadBackup(s).scene.characters.a.name).toBe('Кот')
  })

  it('clearBackup и отсутствие storage не падают', () => {
    const s = memStorage()
    saveBackup({ scene: newDraft() }, s)
    clearBackup(s)
    expect(loadBackup(s)).toBeNull()
    expect(saveBackup({ scene: null }, s)).toBe(false)
    const broken = { getItem: () => { throw new Error('quota') }, setItem: () => { throw new Error('quota') }, removeItem: () => {} }
    expect(saveBackup({ scene: newDraft() }, broken)).toBe(false)
    expect(loadBackup(broken)).toBeNull()
    expect(formatBackupTime('nope')).toBe('')
  })
})
