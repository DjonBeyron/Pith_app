import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SEED_RULES } from './lessonRulesSeed.js'
import { buildAuthorPrompt } from './authorPrompt.js'
import { buildJudgePrompt, judgeGroups, rulesForGroup } from './judgePrompt.js'
import { groupOf } from './ruleMeta.js'

// Гигиена набора правил — «система не деградирует от избытка правил» (PROJECT.md, «Порядок в правилах», 2026-10-22). Это храповик:
// пределы — чуть выше текущего состояния; новое правило, которое их ломает, должно сначала что-то слить или уйти в линтер/справку
const DIR = fileURLToPath(new URL('.', import.meta.url))
const LINT_SRC = readdirSync(DIR).filter(f => /^lessonLint.*\.js$/.test(f) && !f.endsWith('.test.js')).map(f => readFileSync(DIR + f, 'utf8')).join('\n')
const LINT_CODES = new Set(LINT_SRC.match(/\[R-[a-z0-9-]+\]/g).map(c => c.slice(1, -1)))
// Коды формата сцены (lint-scene, структура снимка) — у них нет правила-принципа, это проверка формата, а не качества урока
const FORMAT_CODES = new Set(['R-scene-mode', 'R-scene-start', 'R-scene-size', 'R-scene-crop', 'R-scene-invalid', 'R-scene-missing', 'R-scene-played', 'R-scene-silent'])
const codesOf = r => r.text.match(/R-[a-z0-9-]+/g) ?? []
const seed = SEED_RULES.map((r, i) => ({ id: `s${i}`, active: true, ...r }))
const principles = seed.filter(r => r.category === 'principle')

describe('гигиена набора правил (бюджет, примеры, связь с линтером)', () => {
  it('размер: ≤ 100 принципов, ≤ 10 пунктов чек-листа, ≤ 30 правил судьи в группе', () => {
    expect(principles.length).toBeLessThanOrEqual(100)
    expect(seed.filter(r => r.category === 'checklist').length).toBeLessThanOrEqual(10)
    for (const g of judgeGroups(seed)) expect(rulesForGroup(seed, g).length, g).toBeLessThanOrEqual(30)
  })
  it('текст правила ≤ 900 знаков (справка не считается), название ≤ 70', () => {
    for (const r of seed) {
      if (r.category !== 'reference') expect(r.text.length, r.title).toBeLessThanOrEqual(900)
      expect(r.title.length, r.title).toBeLessThanOrEqual(70)
    }
  })
  it('у каждого правила судьи — оба примера («нельзя» и «можно»), у авто-правил — хотя бы «нельзя»', () => {
    for (const r of seed.filter(r => r.checker === 'judge')) { expect(r.bad, r.title).not.toBe(''); expect(r.good, r.title).not.toBe('') }
    for (const r of seed.filter(r => r.checker === 'auto')) expect(r.bad, r.title).not.toBe('')
  })
  it('каждое авто-правило называет существующий код линтера, каждый код линтера (кроме формата сцены) назван в каком-то правиле', () => {
    for (const r of seed.filter(r => r.checker === 'auto')) {
      const codes = codesOf(r)
      expect(codes.length, `${r.title}: нет кода линтера`).toBeGreaterThan(0)
      for (const c of codes) expect(LINT_CODES.has(c), `${r.title}: кода ${c} нет в линтере`).toBe(true)
    }
    const named = new Set(seed.flatMap(codesOf))
    const orphan = [...LINT_CODES].filter(c => !named.has(c) && !FORMAT_CODES.has(c))
    expect(orphan, 'коды линтера без правила').toEqual([])
    for (const r of seed.filter(r => r.checker === 'judge')) for (const c of codesOf(r)) expect(LINT_CODES.has(c), `${r.title}: ${c}`).toBe(true)
  })
  it('бюджет промптов: автор ≤ 110 000 знаков, судья по группе ≤ 20 000 (без урока)', () => {
    expect(buildAuthorPrompt(seed, { topic: 'try' }).length).toBeLessThanOrEqual(110_000)
    for (const g of judgeGroups(seed)) expect(buildJudgePrompt(seed, '', { group: g }).length, g).toBeLessThanOrEqual(20_000)
    expect(judgeGroups(seed).length).toBeGreaterThanOrEqual(8)
  })
  it('нет двух правил с одинаковым началом текста (40 знаков) — по нему ищут миграции и синхронизация', () => {
    const heads = seed.map(r => r.text.slice(0, 40))
    expect(heads.filter((h, i) => heads.indexOf(h) !== i)).toEqual([])
  })
  it('группы — только известные, у справки и чек-листа группа задана', () => {
    for (const r of seed) expect(groupOf(r), r.title).toBe(r.group)
  })
})
