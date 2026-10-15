import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Каждая иконочная кнопка сборщика (внутри — только значок, без текста) обязана иметь aria-label:
// иначе скринридер читает «кнопка», а для человека это пустой квадрат. Сканируем исходники
// компонентов окна сборщика (admin/scenes/**, без тестов): ищем <button …>…</button>, выкидываем
// значки (<Icon … />) и выражения без текста; если букв не осталось — кнопка иконочная.
const ROOT = new URL('.', import.meta.url).pathname

function files(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return files(p)
    return /\.jsx$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

// Конец открывающего тега: учитываем {…} и кавычки (в onClick бывает «=>»)
function openTagEnd(src, from) {
  let depth = 0, q = null
  for (let i = from; i < src.length; i++) {
    const c = src[i]
    if (q) { if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return i
  }
  return -1
}

export function findIconButtons(src) {
  const out = []
  let i = 0
  while ((i = src.indexOf('<button', i)) !== -1) {
    const end = openTagEnd(src, i)
    const close = src.indexOf('</button>', end)
    if (end < 0 || close < 0) break
    const open = src.slice(i, end + 1)
    let inner = src.slice(end + 1, close)
    inner = inner.replace(/<[A-Z][\w.]*(?:\s[^<]*?)?\/>/g, '')
    const dynText = /\{\s*[A-Za-z_][\w.]*\s*\}/.test(inner) // {label}, {title} — подпись из переменной
    for (let k = 0; k < 4; k++) inner = inner.replace(/\{[^{}'"`]*\}/g, '')
    const hasText = dynText || /[A-Za-zА-Яа-яЁё]/.test(inner.replace(/<[^>]*>/g, ''))
    const hasIcon = /<[A-Z][\w.]*[\s/]/.test(src.slice(end + 1, close))
    if (hasIcon && !hasText) out.push({ open, label: /aria-label=/.test(open) })
    i = close
  }
  return out
}

describe('иконочные кнопки сборщика сцен', () => {
  const all = files(ROOT).flatMap(f => findIconButtons(readFileSync(f, 'utf8')).map(b => ({ ...b, f: f.replace(ROOT, '') })))
  it('сканер находит кнопки (страховка от пустого прогона)', () => {
    expect(all.length).toBeGreaterThanOrEqual(8)
  })
  it('у каждой есть aria-label', () => {
    const bad = all.filter(b => !b.label).map(b => `${b.f}: ${b.open.slice(0, 90)}`)
    expect(bad).toEqual([])
  })
  it('сканер ловит кнопку без aria-label', () => {
    expect(findIconButtons('<button type="button" onClick={() => go()}><X size={14} /></button>')).toEqual([{ open: '<button type="button" onClick={() => go()}>', label: false }])
    expect(findIconButtons('<button type="button"><X size={14} /> Закрыть</button>')).toEqual([])
  })
})
