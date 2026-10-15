import { describe, it, expect } from 'vitest'
import { isCollapsed, toggleCollapsed, setCollapsed, expandPath, setAllCollapsed, allCollapsed, validCollapsed } from './panelModel.js'
import { densityFor, DENSITY_COMPACT_MAX, DENSITY_NORMAL_MAX } from './density.js'

// Свёрнутость панелей (чистая модель) и плотность по ширине
describe('panelModel', () => {
  it('toggle / set — новый массив, без дублей', () => {
    const a = toggleCollapsed([], 'timeline')
    expect(a).toEqual(['timeline'])
    expect(isCollapsed(a, 'timeline')).toBe(true)
    expect(toggleCollapsed(a, 'timeline')).toEqual([])
    expect(setCollapsed(a, 'timeline', true)).toBe(a) // без изменений — тот же массив
    expect(setCollapsed(a, 'slots', true)).toEqual(['timeline', 'slots'])
  })

  it('expandPath разворачивает всю цепочку к ошибке', () => {
    const c = ['timeline', 'timeline.3', 'characters']
    expect(expandPath(c, ['timeline', 'timeline.3'])).toEqual(['characters'])
    expect(expandPath(c, ['slots'])).toBe(c)
  })

  it('«свернуть все / развернуть все» — только верхний уровень; allCollapsed', () => {
    const keys = ['location', 'slots', 'slots.local', 'characters', 'characters.a']
    const all = setAllCollapsed([], keys, true)
    expect(all).toEqual(['location', 'slots', 'characters'])
    expect(allCollapsed(all, keys)).toBe(true)
    expect(allCollapsed(['location'], keys)).toBe(false)
    expect(setAllCollapsed([...all, 'characters.a'], keys, false)).toEqual(['characters.a'])
    expect(allCollapsed([], [])).toBe(false)
  })

  it('validCollapsed отбраковывает мусор из localStorage', () => {
    expect(validCollapsed(['a', 'b.c'])).toBe(true)
    expect(validCollapsed([])).toBe(true)
    expect(validCollapsed('a')).toBe(false)
    expect(validCollapsed([1])).toBe(false)
    expect(validCollapsed([''])).toBe(false)
    expect(validCollapsed(Array.from({ length: 401 }, () => 'k'))).toBe(false)
  })
})

describe('density', () => {
  it('пороги → compact / normal / roomy; не измерено → normal', () => {
    expect(densityFor(200)).toBe('compact')
    expect(densityFor(DENSITY_COMPACT_MAX - 1)).toBe('compact')
    expect(densityFor(DENSITY_COMPACT_MAX)).toBe('normal')
    expect(densityFor(DENSITY_NORMAL_MAX - 1)).toBe('normal')
    expect(densityFor(DENSITY_NORMAL_MAX)).toBe('roomy')
    expect(densityFor(1400)).toBe('roomy')
    expect(densityFor(0)).toBe('normal')
    expect(densityFor(NaN)).toBe('normal')
    expect(densityFor(undefined)).toBe('normal')
  })
})
