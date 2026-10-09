import { describe, it, expect } from 'vitest'
import { shellState, shellRows } from './shellStatusView.js'

const base = { type: 'shell-status', configured: true, enabled: true, own: true, build: '3.2.1-ab12', version: '3.2.1', disabledUntil: 0, why: '', fails: 0, pending: false, blocked: false,
  caches: [{ name: 'shell-3.2.1-ab12', own: true, full: true, ver: '3.2.1', n: 48, at: 1700000000000 }, { name: 'shell-3.2.0-ff', own: false, full: true, ver: '3.2.0', n: 47 }],
  nav: { source: 'cache', why: 'ok', build: '3.2.1-ab12', ms: 3 } }

describe('Быстрый старт: статус для админки', () => {
  it('включён и кеш готов', () => {
    expect(shellState(base)).toMatchObject({ on: true })
    const rows = Object.fromEntries(shellRows(base, '3.2.1', '3.2.1'))
    expect(rows['Версия оболочки (кеш) / сеть / страница']).toBe('v3.2.1 / v3.2.1 / v3.2.1')
    expect(rows['Эта страница']).toContain('оболочка=cache (build 3.2.1-ab12)')
    expect(rows['Кеши на устройстве']).toContain('shell-3.2.1-ab12 (текущий) 48 ф.')
  })

  it('выключен: причина и срок; сеть новее оболочки видна в строке версий', () => {
    const off = { ...base, enabled: false, disabledUntil: 1700086400000, why: 'nosw' }
    expect(shellState(off)).toMatchObject({ on: false })
    expect(shellState(off).text).toContain('?nosw=1')
    const rows = Object.fromEntries(shellRows(base, '3.2.2', '3.2.1'))
    expect(rows['Версия оболочки (кеш) / сеть / страница']).toBe('v3.2.1 / v3.2.2 / v3.2.1')
  })

  it('нет воркера, dev и кеш ещё не собран — понятные тексты', () => {
    expect(shellState(null).text).toContain('не управляет')
    expect(shellState({ ...base, configured: false }).text).toContain('dev')
    expect(shellState({ ...base, own: false }).text).toContain('ещё не собран')
    expect(shellState({ ...base, own: false, blocked: true }).text).toContain('сброшен')
    expect(shellRows(null, null, '3.2.1')).toHaveLength(1)
  })

  it('защита от залипания показывается, когда есть неудачные запуски', () => {
    const rows = Object.fromEntries(shellRows({ ...base, fails: 1, pending: true }, null, '3.2.1'))
    expect(rows['Защита от залипания']).toContain('1')
    expect(rows['Версия оболочки (кеш) / сеть / страница']).toContain('нет сети')
  })
})
