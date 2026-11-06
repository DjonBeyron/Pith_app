import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RacePlanSource, { PLAN_SOURCE_KEY } from './RacePlanSource.jsx'

// Админ → «Голос» → «Встряхни память (стенд)»: переключатель «План: фикстура / из памяти»
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
afterEach(() => vi.unstubAllGlobals())

describe('RacePlanSource', () => {
  it('по умолчанию — фикстура, сводки памяти нет', () => {
    const html = renderToStaticMarkup(createElement(RacePlanSource, { plan: { source: 'sim', extraWords: [] }, load: async () => ({}) }))
    expect(html).toContain('data-testid="race-plan-pick"')
    expect(html).toMatch(/<option value="fixture" selected="">фикстура<\/option>/)
    expect(html).not.toContain('race-plan-summary')
  })
  it('выбор «из памяти» помнится в localStorage', () => {
    vi.stubGlobal('localStorage', { getItem: k => (k === PLAN_SOURCE_KEY ? 'memory' : null), setItem() {} })
    const html = renderToStaticMarkup(createElement(RacePlanSource, { plan: { source: 'sim', extraWords: [] }, load: async () => ({}) }))
    expect(html).toMatch(/<option value="memory" selected="">из памяти<\/option>/)
    expect(html).toContain('data-testid="race-plan-summary"')
  })
  it('RaceBlock: план из памяти идёт через buildMemoryPlan, переключатель — отдельный компонент', () => {
    const src = read('./RaceBlock.jsx')
    expect(src).toContain('<RacePlanSource plan={racePlan} locked={playing} onDeps={setPlanDeps} />')
    expect(src).toContain('buildMemoryPlan({ base: p, deps: planDeps })')
  })
})
