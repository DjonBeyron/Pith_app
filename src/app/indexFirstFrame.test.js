import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Первый кадр index.html при запуске с «Домой» (iPhone): между нативной стартовой картинкой и первым кадром страницы WKWebView
// показывает белое, пока у страницы нет первой раскладки, а её WebKit не делает, пока не разобран <body>. Поэтому: (1) чёрный фон
// задан до всего остального, (2) в <head> нет ни одного внешнего скрипта без defer/async/module — синхронный останавливал парсер
// до своей загрузки (ещё один круг до воркера, а без воркера — сеть), и это и был белый кадр. См. PROJECT.md, v3.2.2049
const html = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8')
const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, '') // в комментариях тоже встречаются «<body>» и «<script»; noscript — фолбэк без JS
const head = clean.slice(0, clean.indexOf('<body'))

describe('index.html: первый кадр без белого', () => {
  it('тёмный фон задан раньше всех скриптов и ссылок на внешние файлы (иначе белый экран, пока они качаются)', () => {
    const bg = clean.indexOf('background: #000;')
    expect(bg).toBeGreaterThan(-1)
    expect(bg).toBeLessThan(clean.indexOf('<script'))
    expect(bg).toBeLessThan(clean.indexOf('<link'))
  })

  it('net-guard.js подключён обычным скриптом с defer (не модуль: работает без бандла; не синхронно: не держит первый кадр)', () => {
    expect(head).toMatch(/<script src="\/net-guard\.js" defer><\/script>/)
  })

  it('в <head> нет ни одного блокирующего внешнего скрипта (без defer/async/type=module)', () => {
    const external = [...head.matchAll(/<script\b([^>]*\bsrc=[^>]*)>/g)].map(m => m[1])
    expect(external.length).toBeGreaterThan(0)
    for (const attrs of external) expect(attrs).toMatch(/\b(defer|async|type="module")\b/)
  })

  it('в <head> нет блокирующих таблиц стилей: внешние <link rel="stylesheet"> только с media=print (шрифты, CSS бандла)', () => {
    for (const m of head.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)) expect(m[0]).toMatch(/media="print"/)
  })
})
