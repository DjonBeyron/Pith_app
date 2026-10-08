import { describe, it, expect, beforeEach, vi } from 'vitest'

// localStorage-пустышка: node без DOM. Модуль читает её при загрузке —
// поэтому перед каждым тестом сбрасываем модули и грузим заново
const store = new Map()
let failStorage = false
globalThis.localStorage = {
  getItem: k => { if (failStorage) throw new Error('denied'); return store.has(k) ? store.get(k) : null },
  setItem: (k, v) => { if (failStorage) throw new Error('denied'); store.set(k, String(v)) },
}

// Звуковой движок подменяем: проверяем, что lessonPrefs регистрирует в нём фильтр
let registeredFilter = null
vi.mock('../../shared/lib/sounds.js', () => ({ setSoundFilter: fn => { registeredFilter = fn } }))

async function load() {
  vi.resetModules()
  registeredFilter = null
  return import('./lessonPrefs.js')
}

describe('настройки шестерёнки: состояние', () => {
  beforeEach(() => { store.clear(); failStorage = false })

  it('по умолчанию всё включено', async () => {
    const m = await load()
    for (const name of ['typing', 'xp', 'equalizer', 'hud']) expect(m.getPref(name)).toBe(true)
  })

  it('переключение пишется в localStorage и переживает перезагрузку', async () => {
    let m = await load()
    m.setPref('typing', false)
    expect(m.getPref('typing')).toBe(false)
    expect(store.get('pithy_pref_typing_sound')).toBe('0')
    expect(m.getPref('xp')).toBe(true)
    m = await load()
    expect(m.getPref('typing')).toBe(false)
    m.setPref('typing', true)
    expect(store.get('pithy_pref_typing_sound')).toBe('1')
  })

  it('ключи хранилища стабильны (в том числе pithy_lesson_hud для админа)', async () => {
    const m = await load()
    expect(m.PREF_KEYS).toEqual({
      typing: 'pithy_pref_typing_sound', xp: 'pithy_pref_xp_sound',
      equalizer: 'pithy_pref_equalizer', hud: 'pithy_lesson_hud',
    })
  })

  it('мусор в хранилище = включено; выключает только «0»', async () => {
    store.set('pithy_pref_equalizer', 'abc')
    store.set('pithy_pref_xp_sound', '0')
    const m = await load()
    expect(m.getPref('equalizer')).toBe(true)
    expect(m.getPref('xp')).toBe(false)
  })

  it('подписчики уведомляются только при реальной смене; чужое имя игнорируется', async () => {
    const m = await load()
    let n = 0
    const off = m.subscribeLessonPrefs(() => { n++ })
    m.setPref('xp', true) // уже true
    expect(n).toBe(0)
    m.setPref('xp', false)
    expect(n).toBe(1)
    m.setPref('nope', false)
    expect(n).toBe(1)
    expect(store.has('undefined')).toBe(false)
    off()
    m.setPref('xp', true)
    expect(n).toBe(1)
  })

  it('storage недоступен (приватный режим): читаем как «включено», пишем молча, состояние в памяти живёт', async () => {
    failStorage = true
    const m = await load()
    expect(m.getPref('typing')).toBe(true)
    expect(() => m.setPref('typing', false)).not.toThrow()
    expect(m.getPref('typing')).toBe(false)
  })
})

describe('фильтр звуков', () => {
  beforeEach(() => { store.clear(); failStorage = false })

  it('при загрузке регистрируется в sounds.js как isSoundEnabledByUser', async () => {
    const m = await load()
    expect(registeredFilter).toBe(m.isSoundEnabledByUser)
  })

  it('по умолчанию пропускает все звуки', async () => {
    const m = await load()
    for (const n of ['typing-1', 'typing-2', 'xp-gain', 'message-in', 'level-up', 'неизвестный']) {
      expect(m.isSoundEnabledByUser(n)).toBe(true)
    }
  })

  it('«Звук печатанья» гасит typing-1 и typing-2 и больше ничего', async () => {
    const m = await load()
    m.setPref('typing', false)
    expect(m.isSoundEnabledByUser('typing-1')).toBe(false)
    expect(m.isSoundEnabledByUser('typing-2')).toBe(false)
    expect(m.isSoundEnabledByUser('xp-gain')).toBe(true)
    expect(m.isSoundEnabledByUser('message-in')).toBe(true)
  })

  it('«Звук получения XP» гасит только xp-gain (level-up остаётся)', async () => {
    const m = await load()
    m.setPref('xp', false)
    expect(m.isSoundEnabledByUser('xp-gain')).toBe(false)
    expect(m.isSoundEnabledByUser('level-up')).toBe(true)
    expect(m.isSoundEnabledByUser('typing-1')).toBe(true)
  })

  it('эквалайзер и hud на звуки не влияют', async () => {
    const m = await load()
    m.setPref('equalizer', false)
    m.setPref('hud', false)
    expect(m.isSoundEnabledByUser('xp-gain')).toBe(true)
    expect(m.isSoundEnabledByUser('typing-1')).toBe(true)
  })
})

describe('hudVisible: переключатель «FPS и версия» только для админа', () => {
  it('админ — по переключателю; не админ — переключатель ничего не значит', async () => {
    const { hudVisible } = await load()
    expect(hudVisible(true, true)).toBe(true)
    expect(hudVisible(true, false)).toBe(false)
    expect(hudVisible(false, false)).toBe(true)
    expect(hudVisible(false, true)).toBe(true)
  })
})
