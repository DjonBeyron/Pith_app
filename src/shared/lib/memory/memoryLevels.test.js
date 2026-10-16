import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MEMORY_LEVELS, levelOfStep, levelOfWord, levelName, levelTitle, levelNameWord, levelOne, levelHex, levelVar, levelClass, LEVEL_PERM } from './memoryLevels.js'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const css = readFileSync(join(ROOT, 'src/styles/memory-levels.css'), 'utf8')

describe('единый стандарт уровней памяти', () => {
  it('пять уровней 0..4 с названиями нормы', () => {
    expect(MEMORY_LEVELS.map(l => l.id)).toEqual([0, 1, 2, 3, 4])
    expect(MEMORY_LEVELS.map(l => l.name)).toEqual(['Временные', 'Новые', 'Знакомые', 'Усвоенные', 'Постоянная память'])
    expect(MEMORY_LEVELS.map(l => l.nameWord)).toEqual(['временные слова', 'новые слова', 'знакомые слова', 'усвоенные слова', 'слова в постоянной памяти'])
    expect(MEMORY_LEVELS.map(l => l.colorName)).toEqual(['серый', 'зелёный', 'синий', 'фиолетовый', 'золотой'])
    expect([0, 1, 2, 3, 4].map(levelTitle)).toEqual(['Временные слова', 'Новые слова', 'Знакомые слова', 'Усвоенные слова', 'Постоянная память'])
    expect(levelOne(1)).toBe('Новое слово')
    expect(levelName(2)).toBe('Знакомые')
    expect(levelNameWord(3)).toBe('усвоенные слова')
  })

  it('шаги БД: 1–2 новые, 3–4 знакомые, 5 усвоенные, settled_on — постоянная, нет строки — 0', () => {
    expect([1, 2, 3, 4, 5].map(s => levelOfStep(s))).toEqual([1, 1, 2, 2, 3])
    expect(levelOfStep(5, true)).toBe(4)
    expect(levelOfStep(null)).toBe(0)
    expect(levelOfStep(undefined)).toBe(0)
    expect(levelOfWord(null)).toBe(0)
    expect(levelOfWord({ step: 1 })).toBe(1)
    expect(levelOfWord({ step: 4, settled_on: null })).toBe(2)
    expect(levelOfWord({ step: 5 })).toBe(3)
    expect(levelOfWord({ step: 5, settled_on: '2026-10-01' })).toBe(LEVEL_PERM)
  })

  it('CSS-класс — всегда номер уровня (никаких Perm / P)', () => {
    expect(levelClass('memChip', 4)).toBe('memChip--4')
    expect(levelClass('fwKnown', 0)).toBe('fwKnown--0')
    expect(levelVar(3)).toBe('var(--lvl3)')
  })

  it('hex модели совпадает с токенами memory-levels.css (тёмная тема — первый :root)', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
    for (const l of MEMORY_LEVELS) {
      expect(root).toContain(`--lvl${l.id}: ${l.hex};`)
      expect(root).toContain(`--lvl${l.id}-rgb: ${l.rgb};`)
    }
  })

  it('контраст цветов на тёмных поверхностях ≥ 4.5:1', () => {
    const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    const lum = h => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) }
    for (const bg of ['#14171c', '#1a1d22']) for (const l of MEMORY_LEVELS) {
      expect((lum(levelHex(l.id)) + 0.05) / (lum(bg) + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('золото — статично: в токенах и классах уровня нет анимаций и тяжёлых эффектов', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/@keyframes|animation|will-change|filter:|blur\(/)
    expect(css).toContain('--lvl4-shine')
  })

  it('в компонентах уровней нет старых захардкоженных цветов и ключей Perm/P', () => {
    const dirs = ['src/features/learn', 'src/features/feed', 'src/features/review']
    const bad = /#f1bd3c|#a78bfa|#8b5cf6|--lvlP|'Perm'|--Perm|fwKnown--P/
    const hits = []
    const walk = d => readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(js|jsx)$/.test(e.name) && !/\.test\./.test(e.name) && bad.test(readFileSync(p, 'utf8'))) hits.push(p)
    })
    dirs.forEach(d => walk(join(ROOT, d)))
    expect(hits).toEqual([])
  })
})
