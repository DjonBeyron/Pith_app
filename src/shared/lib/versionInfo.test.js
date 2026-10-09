import { describe, it, expect } from 'vitest'
import { SEEN_KEY, PREV_KEY, formatStamp, updateSeen, noteVersionSeen, readVersionInfo, versionLine } from './versionInfo.js'

const mem = (init = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }
}
const broken = () => ({ getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } })
// Локальное время (не зависит от пояса, в котором гоняют тест): 09.10.2026 20:15 и 20:31
const local = (h, min) => new Date(2026, 9, 9, h, min).getTime()
const iso = ms => new Date(ms).toISOString()

describe('formatStamp: ДД.ММ.ГГГГ ЧЧ:ММ в локальной таймзоне', () => {
  it('ISO (UTC) и миллисекунды показываются локальным временем; нули спереди', () => {
    expect(formatStamp(iso(local(20, 15)))).toBe('09.10.2026 20:15')
    expect(formatStamp(local(8, 5))).toBe('09.10.2026 08:05')
    expect(formatStamp(new Date(2027, 0, 3, 0, 0).getTime())).toBe('03.01.2027 00:00')
  })
  it('пусто и мусор → «—»', () => {
    for (const v of [null, undefined, '', 'вчера', NaN]) expect(formatStamp(v)).toBe('—')
  })
})

describe('updateSeen: момент, когда версия впервые запущена', () => {
  it('записи не было → создаём с firstSeenAt = now', () => {
    expect(updateSeen(null, { version: '3.2.1904', buildTime: 'B', now: 100 })).toEqual({
      seen: { version: '3.2.1904', buildTime: 'B', firstSeenAt: 100 }, prev: null, changed: true,
    })
  })
  it('та же версия → запись не меняется, момент первого запуска сохраняется', () => {
    const old = { version: '3.2.1904', buildTime: 'B', firstSeenAt: 100 }
    expect(updateSeen(old, { version: '3.2.1904', buildTime: 'B2', now: 999 })).toEqual({ seen: old, prev: null, changed: false })
  })
  it('версия сменилась → новая запись, старая уходит в prev', () => {
    const old = { version: '3.2.1903', buildTime: 'A', firstSeenAt: 50 }
    const r = updateSeen(old, { version: '3.2.1904', buildTime: 'B', now: 100 })
    expect(r).toEqual({ seen: { version: '3.2.1904', buildTime: 'B', firstSeenAt: 100 }, prev: old, changed: true })
  })
  it('битая прошлая запись игнорируется как отсутствующая', () => {
    expect(updateSeen({ version: 5 }, { version: 'v', now: 1 }).prev).toBeNull()
    expect(updateSeen('мусор', { version: 'v', now: 1 }).changed).toBe(true)
  })
})

describe('noteVersionSeen / readVersionInfo: localStorage', () => {
  it('первый запуск пишет pithy_version_seen_v1; повторный запуск той же версии ничего не меняет', () => {
    const s = mem()
    noteVersionSeen({ version: '3.2.1904', buildTime: 'B', now: 100, store: s })
    expect(JSON.parse(s.getItem(SEEN_KEY))).toEqual({ version: '3.2.1904', buildTime: 'B', firstSeenAt: 100 })
    noteVersionSeen({ version: '3.2.1904', buildTime: 'B', now: 500, store: s })
    expect(JSON.parse(s.getItem(SEEN_KEY)).firstSeenAt).toBe(100)
    expect(s.getItem(PREV_KEY)).toBeNull()
  })

  it('смена версии: новая запись, старая — в pithy_version_prev_v1; показывается «было …»', () => {
    const s = mem()
    noteVersionSeen({ version: '3.2.1903', buildTime: 'A', now: 50, store: s })
    const r = noteVersionSeen({ version: '3.2.1904', buildTime: 'B', now: 100, store: s })
    expect(r.prev).toEqual({ version: '3.2.1903', buildTime: 'A', firstSeenAt: 50 })
    expect(JSON.parse(s.getItem(PREV_KEY)).version).toBe('3.2.1903')
    expect(JSON.parse(s.getItem(SEEN_KEY))).toEqual({ version: '3.2.1904', buildTime: 'B', firstSeenAt: 100 })
    expect(readVersionInfo({ version: '3.2.1904', buildTime: 'B', store: s })).toEqual({ version: '3.2.1904', buildTime: 'B', firstSeenAt: 100, prevVersion: '3.2.1903' })
    // после третьего запуска той же версии «было» остаётся
    noteVersionSeen({ version: '3.2.1904', buildTime: 'B', now: 900, store: s })
    expect(readVersionInfo({ version: '3.2.1904', buildTime: 'B', store: s }).prevVersion).toBe('3.2.1903')
  })

  it('отметки при старте не было (запись другой версии) — «на этом устройстве с» не показываем', () => {
    const s = mem({ [SEEN_KEY]: JSON.stringify({ version: '3.2.1900', buildTime: null, firstSeenAt: 1 }) })
    expect(readVersionInfo({ version: '3.2.1904', buildTime: 'B', store: s }).firstSeenAt).toBeNull()
  })

  it('localStorage недоступен: не падает, версия считается впервые запущенной сейчас', () => {
    const r = noteVersionSeen({ version: '3.2.1904', buildTime: 'B', now: 100, store: broken() })
    expect(r.seen.firstSeenAt).toBe(100)
    expect(readVersionInfo({ version: '3.2.1904', buildTime: 'B', store: broken() }).firstSeenAt).toBeNull()
  })
})

describe('versionLine: строка для админки', () => {
  it('полная строка: версия · собрана · на этом устройстве с (было …)', () => {
    const line = versionLine({ version: '3.2.1904', buildTime: iso(local(20, 15)), firstSeenAt: local(20, 31), prevVersion: '3.2.1903' })
    expect(line).toBe('Версия 3.2.1904 · собрана 09.10.2026 20:15 · на этом устройстве с 09.10.2026 20:31 (было 3.2.1903)')
  })
  it('без предыдущей версии — без скобок; без данных — без соответствующих кусков', () => {
    expect(versionLine({ version: '3.2.1904', buildTime: iso(local(20, 15)), firstSeenAt: local(20, 31), prevVersion: null }))
      .toBe('Версия 3.2.1904 · собрана 09.10.2026 20:15 · на этом устройстве с 09.10.2026 20:31')
    expect(versionLine({ version: '3.2.1904', buildTime: null, firstSeenAt: null, prevVersion: null })).toBe('Версия 3.2.1904')
  })
  it('сейчас (по умолчанию) берёт версию приложения и время сборки из vite define', () => {
    const info = readVersionInfo({ store: mem() })
    expect(info.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(info.buildTime).toMatch(/^\d{4}-\d{2}-\d{2}T/) // __BUILD_TIME__ — ISO UTC
  })
})
