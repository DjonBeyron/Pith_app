import { describe, it, expect } from 'vitest'
import {
  CATCH_PREFS_KEY, defaultCatchPrefs, readCatchPrefs, writeCatchPrefs, resolveModuleId, withLevels,
} from './catchAdminPrefs.js'

// Хранилище-пустышка в памяти
function memStore(initial = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }
}
const broken = () => ({ getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } })

describe('catchAdminPrefs: чтение/запись', () => {
  it('пусто → значения по умолчанию', () => {
    expect(readCatchPrefs(memStore())).toEqual(defaultCatchPrefs())
  })

  it('записанное читается обратно, уровни — по каждой фразе отдельно', () => {
    const st = memStore()
    let p = defaultCatchPrefs()
    p = { ...p, moduleId: 'b', write: true, help: true }
    p = withLevels(p, 'a', { 0: 2, 3: 4 })
    p = withLevels(p, 'b', { 1: 1 })
    expect(writeCatchPrefs(p, st)).toBe(true)
    expect(st.map.has(CATCH_PREFS_KEY)).toBe(true)
    const back = readCatchPrefs(st)
    expect(back).toEqual(p)
    expect(back.levelsByModule.a).toEqual({ 0: 2, 3: 4 })
    expect(back.levelsByModule.b).toEqual({ 1: 1 })
  })

  it('withLevels не мутирует исходные prefs и не трогает другие фразы', () => {
    const p = withLevels(defaultCatchPrefs(), 'a', { 0: 1 })
    const q = withLevels(p, 'b', { 2: 3 })
    expect(p.levelsByModule).toEqual({ a: { 0: 1 } })
    expect(q.levelsByModule).toEqual({ a: { 0: 1 }, b: { 2: 3 } })
  })

  it('битый JSON и не-объект → по умолчанию, без исключений', () => {
    expect(readCatchPrefs(memStore({ [CATCH_PREFS_KEY]: '{oops' }))).toEqual(defaultCatchPrefs())
    expect(readCatchPrefs(memStore({ [CATCH_PREFS_KEY]: '42' }))).toEqual(defaultCatchPrefs())
    expect(readCatchPrefs(memStore({ [CATCH_PREFS_KEY]: '[1,2]' }))).toEqual(defaultCatchPrefs())
    expect(readCatchPrefs(memStore({ [CATCH_PREFS_KEY]: 'null' }))).toEqual(defaultCatchPrefs())
  })

  it('битые поля отбрасываются по одному, живые остаются', () => {
    const raw = JSON.stringify({
      moduleId: 7, write: 'yes', help: true,
      levelsByModule: { a: { 0: 2, 1: 9, x: 1, 2: 1.5, 3: '2' }, b: 'oops' },
    })
    const p = readCatchPrefs(memStore({ [CATCH_PREFS_KEY]: raw }))
    expect(p.moduleId).toBe('')
    expect(p.write).toBe(false)
    expect(p.help).toBe(true)
    expect(p.levelsByModule).toEqual({ a: { 0: 2 }, b: {} })
  })

  it('хранилище бросает (приватный режим) или его нет — чтение по умолчанию, запись false', () => {
    expect(readCatchPrefs(broken())).toEqual(defaultCatchPrefs())
    expect(writeCatchPrefs(defaultCatchPrefs(), broken())).toBe(false)
    expect(readCatchPrefs(null)).toEqual(defaultCatchPrefs())
    expect(writeCatchPrefs(defaultCatchPrefs(), null)).toBe(false)
  })
})

describe('resolveModuleId', () => {
  const list = [{ id: 'a' }, { id: 'b' }]
  it('сохранённая фраза есть в списке — она', () => expect(resolveModuleId('b', list)).toBe('b'))
  it('сохранённой уже нет — первая', () => expect(resolveModuleId('zzz', list)).toBe('a'))
  it('ничего не сохранено — первая', () => expect(resolveModuleId('', list)).toBe('a'))
  it('список пуст — пустая строка', () => {
    expect(resolveModuleId('a', [])).toBe('')
    expect(resolveModuleId('a', null)).toBe('')
  })
})
