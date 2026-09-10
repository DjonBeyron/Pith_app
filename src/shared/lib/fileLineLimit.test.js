import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

// Твёрдый потолок из CLAUDE.md — 400 строк на файл. В eslint.config.js то же
// правило стоит с skipComments/skipBlankLines, и из-за этого файлы спокойно
// доходили до 502 ФИЗИЧЕСКИХ строк, а lint молчал: комментариев в этом проекте
// много, и половина файла для правила была невидима. Здесь считаем строки так
// же, как их считает человек, открывший файл, — иначе правило не работает.
const HARD_LIMIT = 400
// Мягкий ориентир из CLAUDE.md — не ошибка, но список должен быть на виду
const SOFT_LIMIT = 250

const SRC = fileURLToPath(new URL('../../', import.meta.url))
const SKIP_DIRS = new Set(['node_modules', 'dist', '_debug'])

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out)
    } else if (/\.(jsx?|css)$/.test(e.name)) {
      out.push(join(dir, e.name))
    }
  }
  return out
}

// Считаем ровно как wc -l и как показывает редактор: завершающий перевод
// строки закрывает последнюю строку, а не открывает новую. Без этой поправки
// счёт был на единицу больше, и файл ровно в 400 строк объявлялся нарушителем
function countLines(text) {
  const n = text.split('\n').length
  return text.endsWith('\n') ? n - 1 : n
}

const files = walk(SRC).map(f => ({
  path: relative(SRC, f).replace(/\\/g, '/'),
  lines: countLines(readFileSync(f, 'utf8')),
}))

describe('лимит размера файлов (CLAUDE.md)', () => {
  it('в src/ есть что считать — иначе тест зелёный впустую', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('ни один файл не длиннее 400 физических строк', () => {
    const over = files.filter(f => f.lines > HARD_LIMIT)
      .sort((a, b) => b.lines - a.lines)
      .map(f => `${f.path} — ${f.lines}`)
    expect(over).toEqual([])
  })

  it('счёт идёт по физическим строкам, а не по «строкам без комментариев»', () => {
    // Страховка от того, что кто-то «починит» этот тест, отфильтровав
    // комментарии как в eslint: тогда он снова перестанет ловить длинные файлы
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    expect(self).toContain("split('\\n').length")
    // Файл, где почти всё — комментарии, тест обязан видеть целиком
    const commented = files.find(f => f.path === 'features/player/panels/flyPanelParts.js')
    expect(commented.lines).toBeGreaterThan(150)
  })

  it('файлы за мягким ориентиром 250 строк пересчитаны — список меняется осознанно', () => {
    const soft = files.filter(f => f.lines > SOFT_LIMIT).length
    // Не запрет, а счётчик: растёт — значит проект снова копит большие файлы.
    // Поднимать это число можно, но только вместе с решением, что так надо.
    expect(soft).toBeLessThanOrEqual(60)
  })
})
