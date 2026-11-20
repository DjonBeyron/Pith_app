import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CAT_LINES } from '../player/modules/rotate-phone/wordLaneCatLines.js'

// Страховка озвучки (v3.3.300): каждая реплика, которую код произносит по id (line('…'), miaLine('…'), sayLine('…'), say:[line(…)]), обязана быть в каталоге CAT_LINES — иначе таблица озвучки её не покажет,
// «Озвучить недостающие» не увидит, а игра промолчит. Тест читает исходники и сверяет id; реплики с вариантами (mia_streak_1…3, boss_mia_five_1…) проверяются по группе.
const ids = new Set(CAT_LINES.map(l => l.id))
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [] })
const root = new URL('..', import.meta.url).pathname
const files = [...walk(join(root, 'pitrace')), ...walk(join(root, 'rehearsal')), ...walk(join(root, 'player'))]
const RE = /\b(?:line|miaLine|sayLine|lineOf|say)\(\s*'([a-z][a-z0-9_]+)'/g

describe('каждая реплика, которую произносит код, есть в каталоге озвучки', () => {
  it('нашёл вызовы и все id известны', () => {
    const used = new Map()
    for (const f of files) { const src = readFileSync(f, 'utf8'); for (const m of src.matchAll(RE)) { if (!/^(mia|pit|boss|race|rh|rh2|your|well|split|try|round)_/.test(m[1])) continue; if (!used.has(m[1])) used.set(m[1], f.replace(root, '')) } }
    expect(used.size).toBeGreaterThan(20)
    const unknown = [...used].filter(([id]) => !ids.has(id) && !ids.has(`${id}_1`) && !ids.has(`${id}_a`)).map(([id, f]) => `${id} (${f})`)
    expect(unknown).toEqual([])
  })
  it('в каталоге нет повторов id', () => { expect(CAT_LINES.length).toBe(ids.size) })
})
