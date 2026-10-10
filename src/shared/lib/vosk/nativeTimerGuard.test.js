import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// iOS/WebKit: setTimeout/clearTimeout/fetch и т.п., положенные свойством в объект и вызванные как d.clearTimer(x), падают с «Illegal invocation»
// (this = объект). В Node это не воспроизводится, поэтому сторожим исходники: нативные функции в свойства объектов — только через стрелку-обёртку.
const NATIVE = /:\s*(?:window\.)?(setTimeout|clearTimeout|setInterval|clearInterval|requestIdleCallback|cancelIdleCallback|fetch|requestAnimationFrame|cancelAnimationFrame)\s*[,}]/
const SRC = new URL('../../..', import.meta.url).pathname

function files(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(js|jsx)$/.test(n) && !/\.test\.js$/.test(n) ? [p] : []
  })
}

describe('нативные функции браузера не кладём в свойства объектов', () => {
  it('нет «setTimer: setTimeout» и подобного', () => {
    const bad = files(SRC).flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => (NATIVE.test(l) ? `${f.replace(SRC, 'src')}:${i + 1}` : null)).filter(Boolean))
    expect(bad).toEqual([])
  })
})
