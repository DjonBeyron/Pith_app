import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { miaDropPlan, IMPACT_MS } from './miaDropPlan.js'
import { ARR, IMPACT } from './miaMotion.js'

// Коробка Мии накрывает Пита ровно к концу реплики его этапа (владелец 2026-11-27): старт падения = конец реплики − время падения, не раньше начала реплики.
describe('срок падения коробки Мии (miaDropPlan)', () => {
  it('время падения — от старта до удара (IMPACT ≈ 0,95 с), число не «забито»: берётся из движения коробки', () => {
    expect(IMPACT_MS).toBe(Math.round(IMPACT * 1000)); expect(IMPACT_MS).toBeGreaterThan(800)
  })
  it('удар приходится на конец реплики: реплика 2,6 с, начало через 250 мс → падение стартует за IMPACT_MS до конца', () => {
    const p = miaDropPlan({ lineAtMs: 250, lineMs: 2600 })
    expect(p.dropAt).toBe(250 + 2600 - IMPACT_MS); expect(p.dropAt + IMPACT_MS).toBe(250 + 2600)
  })
  it('удар раньше конца на запас; длиннее файл (после переозвучки) — позже старт: число из длины записи', () => {
    expect(miaDropPlan({ lineAtMs: 250, lineMs: 2600, reserveMs: 100 }).dropAt).toBe(250 + 2600 - IMPACT_MS - 100)
    expect(miaDropPlan({ lineAtMs: 250, lineMs: 3400 }).dropAt - miaDropPlan({ lineAtMs: 250, lineMs: 2600 }).dropAt).toBe(800)
  })
  it('короткая реплика (короче падения): коробка стартует с началом реплики, не раньше', () => {
    const p = miaDropPlan({ lineAtMs: 250, lineMs: 500 })
    expect(p.dropAt).toBe(250)
  })
  it('реплика без звука: длина — оценка по тексту (её даёт mspeech.msOf); нулевая длина и мусор → старт со входа, без отрицательных сроков', () => {
    expect(miaDropPlan({ lineMs: 0 }).dropAt).toBe(0); expect(miaDropPlan({}).dropAt).toBe(0)
    expect(miaDropPlan({ lineAtMs: -5, lineMs: -9 }).dropAt).toBe(0)
    expect(miaDropPlan({ lineAtMs: 250, lineMs: 1800 }).dropAt).toBeGreaterThanOrEqual(250)
  })
  it('прыжок Мии остаётся там же, где был при «падении через 300 мс после конца»: абсолютный срок прежний', () => {
    const len = 2600, p = miaDropPlan({ lineAtMs: 250, lineMs: len })
    expect(p.dropAt + p.jumpAt * 1000).toBeCloseTo(300 + len + ARR.JUMP * 1000, 0)
    expect(p.jumpAt).toBeGreaterThan(ARR.JUMP) // коробка раньше — до прыжка дольше
  })
  it('директор берёт срок отсюда (useMiaEnter) и передаёт прыжок; экзамен идёт своим путём', () => {
    const src = readFileSync(new URL('./useMiaEnter.js', import.meta.url), 'utf8')
    expect(src).toContain('miaDropPlan({'); expect(src).toContain(': plan?.jumpAt'); expect(src).toContain('const bossDrop = boss ? BOSS.DROP_AT')
  })
})
