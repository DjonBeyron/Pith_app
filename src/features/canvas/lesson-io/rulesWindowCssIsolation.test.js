import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Классы окна правил (.rw*) не должны совпадать с классами из других CSS приложения: раньше они назывались .lr* и пересекались со стилями
// вкладки «Повторение» (learn.css: .lrTop, .lrBtn) — из-за этого верхняя панель окна съедала список, а кнопки не нажимались
const root = new URL('../../../styles/', import.meta.url).pathname
const walk = dir => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : f.endsWith('.css') ? [join(dir, f)] : []))
const classes = css => new Set([...css.matchAll(/\.([A-Za-z][\w-]*)/g)].map(m => m[1]))

describe('окно правил: изоляция CSS-классов', () => {
  const own = join(root, 'canvas/lesson-rules.css')
  const mine = [...classes(readFileSync(own, 'utf8'))].filter(c => /^rw[A-Z]/.test(c))
  it('все классы окна начинаются с rw и не определены в других файлах стилей', () => {
    expect(mine.length).toBeGreaterThan(10)
    for (const f of walk(root).filter(f => f !== own)) {
      const other = classes(readFileSync(f, 'utf8'))
      for (const c of mine) expect(other.has(c), `${c} уже есть в ${f}`).toBe(false)
    }
  })
  it('в стилях окна нет старых классов .lr*', () => {
    expect([...classes(readFileSync(own, 'utf8'))].filter(c => /^lr[A-Z]/.test(c))).toEqual([])
  })
})
