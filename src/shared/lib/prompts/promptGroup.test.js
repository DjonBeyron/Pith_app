import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DEFAULT_SHARE, MAX_SHARE, GROUPS, GROUP_KEY, SHARE_CACHE_KEY,
  hashId, groupFor, clampShare, resolveGroup, allowedInGroup,
  currentGroup, applyShare, adoptProfileGroup, getGroupForSignup, resetGroupMemo,
} from './promptGroup.js'

// В окружении vitest localStorage нет — подставляем простой мок
function mockStorage(initial = {}) {
  const data = { ...initial }
  vi.stubGlobal('localStorage', {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
  })
  return data
}
// Хранилище, которое бросает на любом обращении (приватный режим, заблокированные данные сайта)
const brokenStorage = () => vi.stubGlobal('localStorage', {
  getItem: () => { throw new Error('denied') },
  setItem: () => { throw new Error('denied') },
})

const uuid = i => `u-${i}-${(i * 2654435761 >>> 0).toString(16)}-${(i * 40503 % 65536).toString(16)}`

describe('hashId / groupFor', () => {
  it('хеш стабилен и лежит в 0..99', () => {
    expect(hashId('abc')).toBe(hashId('abc'))
    expect(hashId('')).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < 500; i++) {
      const h = hashId(uuid(i))
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(100)
    }
    expect(hashId(null)).toBe(hashId(''))
  })
  it('доля control при share 10 на 10 000 id — в пределах 8–12%', () => {
    let control = 0
    for (let i = 0; i < 10_000; i++) if (groupFor(uuid(i), 10) === GROUPS.control) control++
    expect(control / 10_000).toBeGreaterThan(0.08)
    expect(control / 10_000).toBeLessThan(0.12)
  })
  it('группа не меняется при повторном вызове; рост доли только добавляет в control', () => {
    for (let i = 0; i < 300; i++) {
      const id = uuid(i)
      expect(groupFor(id, 10)).toBe(groupFor(id, 10))
      if (groupFor(id, 10) === GROUPS.control) expect(groupFor(id, 30)).toBe(GROUPS.control)
    }
  })
  it('share = 0 — всегда prompts; зажим доли в 0..50', () => {
    for (let i = 0; i < 300; i++) expect(groupFor(uuid(i), 0)).toBe(GROUPS.prompts)
    expect(clampShare(-5)).toBe(0)
    expect(clampShare(80)).toBe(MAX_SHARE)
    expect(clampShare('25')).toBe(25)
    expect(clampShare(7.6)).toBe(8)
    expect(clampShare('мусор')).toBe(DEFAULT_SHARE)
    expect(clampShare(undefined)).toBe(DEFAULT_SHARE)
    // доля 100 зажата до 50: контрольной не больше половины
    let control = 0
    for (let i = 0; i < 2000; i++) if (groupFor(uuid(i), 100) === GROUPS.control) control++
    expect(control / 2000).toBeLessThan(0.56)
  })
})

describe('resolveGroup', () => {
  const id = 'device-1'
  const fromHash = groupFor(id, 10)
  const other = fromHash === GROUPS.control ? GROUPS.prompts : GROUPS.control
  it('профиль побеждает запомненную и вычисленную', () => {
    expect(resolveGroup({ stored: 'prompts', id, share: 50, profileGroup: 'control' })).toBe('control')
  })
  it('запомненная побеждает вычисленную (прилипание при смене доли)', () => {
    expect(resolveGroup({ stored: other, id, share: 10 })).toBe(other)
  })
  it('нет ни профиля, ни запомненной — по хешу', () => {
    expect(resolveGroup({ id, share: 10 })).toBe(fromHash)
    expect(resolveGroup({ stored: 'мусор', profileGroup: 'тоже', id, share: 10 })).toBe(fromHash)
    expect(resolveGroup()).toBe(GROUPS.prompts) // пустой вход: hashId('') при DEFAULT-доле не падает
  })
})

describe('allowedInGroup', () => {
  const c = reason => ({ id: 'x', kind: 'question', reason })
  it('control: вопросы по поведению, игры и подсказки интерфейса скрыты', () => {
    for (const r of ['behavior', 'game_offer', 'ui_hint']) expect(allowedInGroup('control', c(r))).toBe(false)
  })
  it('control: функциональные шаги разрешены', () => {
    for (const r of ['explain_done', 'asked', 'notify_ask']) expect(allowedInGroup('control', c(r))).toBe(true)
  })
  it('prompts и неизвестная группа: разрешено всё', () => {
    for (const r of ['behavior', 'game_offer', 'ui_hint', 'explain_done']) expect(allowedInGroup('prompts', c(r))).toBe(true)
    expect(allowedInGroup(undefined, c('behavior'))).toBe(true)
  })
})

describe('обёртки над localStorage', () => {
  beforeEach(() => { vi.unstubAllGlobals(); resetGroupMemo() })

  it('первое обращение вычисляет группу по anon_id и записывает её', () => {
    const data = mockStorage({ pithy_anon_id: 'anon-777' })
    const g = currentGroup()
    expect(g).toBe(groupFor('anon-777', DEFAULT_SHARE))
    expect(JSON.parse(data[GROUP_KEY])).toEqual({ group: g, share: DEFAULT_SHARE, id: 'anon-777' })
  })
  it('доля берётся из кэша настройки', () => {
    // подбираем id, который при доле 10 в prompts, а при 50 — в control
    const id = Array.from({ length: 500 }, (_, i) => uuid(i)).find(x => groupFor(x, 10) === 'prompts' && groupFor(x, 50) === 'control')
    mockStorage({ pithy_anon_id: id, [SHARE_CACHE_KEY]: '50' })
    expect(currentGroup()).toBe(GROUPS.control)
  })
  it('запомненная группа возвращается как есть', () => {
    mockStorage({ pithy_anon_id: 'a', [GROUP_KEY]: JSON.stringify({ group: 'control', share: 10, id: 'a' }) })
    expect(currentGroup()).toBe('control')
  })
  it('applyShare обновляет кэш доли, но не меняет уже вычисленную группу', () => {
    const data = mockStorage({ pithy_anon_id: 'anon-777' })
    const g = currentGroup()
    applyShare(25)
    expect(JSON.parse(data[SHARE_CACHE_KEY])).toBe(25)
    resetGroupMemo()
    expect(currentGroup()).toBe(g)
    applyShare(999)
    expect(JSON.parse(data[SHARE_CACHE_KEY])).toBe(MAX_SHARE)
  })
  it('доля 0 = группы нет: даже запомненный control видит вопросы, запомненное не стирается', () => {
    const data = mockStorage({ pithy_anon_id: 'a', [GROUP_KEY]: JSON.stringify({ group: 'control', share: 10, id: 'a' }) })
    applyShare(0)
    expect(currentGroup()).toBe(GROUPS.prompts)
    expect(JSON.parse(data[GROUP_KEY]).group).toBe('control')
    applyShare(10)
    resetGroupMemo()
    expect(currentGroup()).toBe(GROUPS.control)
  })
  it('adoptProfileGroup: группа из профиля побеждает; мусор игнорируется', () => {
    const data = mockStorage({ pithy_anon_id: 'anon-777' })
    const mine = currentGroup()
    const other = mine === GROUPS.control ? GROUPS.prompts : GROUPS.control
    adoptProfileGroup('что-то')
    expect(currentGroup()).toBe(mine)
    adoptProfileGroup(other)
    expect(currentGroup()).toBe(other)
    expect(JSON.parse(data[GROUP_KEY]).group).toBe(other)
    resetGroupMemo()
    expect(currentGroup()).toBe(other) // пережило «перезагрузку»
  })
  it('getGroupForSignup отдаёт текущую группу гостя', () => {
    mockStorage({ pithy_anon_id: 'anon-777' })
    expect(getGroupForSignup()).toBe(currentGroup())
  })
  it('битый JSON в хранилище не ломает: группа вычисляется заново', () => {
    mockStorage({ pithy_anon_id: 'anon-777', [GROUP_KEY]: '{не json', [SHARE_CACHE_KEY]: 'мусор' })
    expect(currentGroup()).toBe(groupFor('anon-777', DEFAULT_SHARE))
  })
  it('хранилище бросает на каждом обращении: ничего не падает, группа стабильна в рамках страницы', () => {
    brokenStorage()
    const g = currentGroup()
    expect([GROUPS.control, GROUPS.prompts]).toContain(g)
    expect(currentGroup()).toBe(g)
    expect(() => applyShare(20)).not.toThrow()
    expect(() => adoptProfileGroup('control')).not.toThrow()
    expect(currentGroup()).toBe('control')
  })
  it('localStorage нет совсем: то же самое', () => {
    expect(() => currentGroup()).not.toThrow()
    expect([GROUPS.control, GROUPS.prompts]).toContain(currentGroup())
  })
})
