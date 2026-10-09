import { describe, it, expect } from 'vitest'
import { formatStamp, readVersionInfo, versionLine } from './versionInfo.js'

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

describe('versionLine: простая строка для админки', () => {
  it('версия · дата и время сборки, без лишних слов', () => {
    expect(versionLine({ version: '3.2.1905', buildTime: iso(local(20, 15)) })).toBe('3.2.1905 · 09.10.2026 20:15')
  })
  it('нет времени сборки (или оно не дата) — только версия', () => {
    expect(versionLine({ version: '3.2.1905', buildTime: null })).toBe('3.2.1905')
    expect(versionLine({ version: '3.2.1905', buildTime: 'вчера' })).toBe('3.2.1905')
  })
  it('в строке нет слов «Версия», «собрана», «на этом устройстве», «было»', () => {
    const line = versionLine({ version: '3.2.1905', buildTime: iso(local(20, 15)) })
    for (const w of ['Версия', 'собрана', 'на этом устройстве', 'было']) expect(line).not.toContain(w)
  })
  it('по умолчанию берёт версию приложения и время сборки из vite define', () => {
    const info = readVersionInfo()
    expect(info.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(info.buildTime).toMatch(/^\d{4}-\d{2}-\d{2}T/) // __BUILD_TIME__ — ISO UTC
    expect(versionLine(info)).toMatch(/^\d+\.\d+\.\d+ · \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/)
  })
})
