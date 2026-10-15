import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import NodeSceneStart from './NodeSceneStart.jsx'
import { nodeStartPatch, nodeStartDelayPatch, nodeStartState, startSummary } from './scenePickerModel.js'
import { resolveSceneNode } from '../scene/v2/sceneNode.js'
import { demoCafeScene } from '../scene/v2/demoScenes.js'

// Запуск сцены в ноде урока (typeData.scene.start / .startDelayMs): патчи пикера и разметка NodeSceneStart
describe('патчи запуска ноды scene', () => {
  it('start: допустимые значения как есть, мусор → auto; задержка: число/строка → целое 0…5000, мусор → 500', () => {
    expect(nodeStartPatch('manual')).toEqual({ start: 'manual' })
    expect(nodeStartPatch('auto')).toEqual({ start: 'auto' })
    expect(nodeStartPatch('later')).toEqual({ start: 'auto' })
    expect(nodeStartDelayPatch(1200)).toEqual({ startDelayMs: 1200 })
    expect(nodeStartDelayPatch('750')).toEqual({ startDelayMs: 750 })
    expect(nodeStartDelayPatch(-10)).toEqual({ startDelayMs: 0 })
    expect(nodeStartDelayPatch(99999)).toEqual({ startDelayMs: 5000 })
    expect(nodeStartDelayPatch('abc')).toEqual({ startDelayMs: 500 })
    expect(nodeStartDelayPatch(333.7)).toEqual({ startDelayMs: 334 })
  })
  it('nodeStartState: дефолты для старых нод; сводка пикера', () => {
    expect(nodeStartState({ scene: demoCafeScene })).toEqual({ start: 'auto', startDelayMs: 500 })
    expect(nodeStartState({ start: 'manual', startDelayMs: 0 })).toEqual({ start: 'manual', startDelayMs: 0 })
    expect(startSummary({})).toBe('запуск: автоматически · 500 мс')
    expect(startSummary({ start: 'auto', startDelayMs: 1500 })).toBe('запуск: автоматически · 1500 мс')
    expect(startSummary({ start: 'manual' })).toBe('запуск: вручную')
    expect(resolveSceneNode({ scene: demoCafeScene, ...nodeStartPatch('manual'), ...nodeStartDelayPatch(200) })).toMatchObject({ start: 'manual', startDelayMs: 200 })
  })
})

describe('NodeSceneStart — разметка', () => {
  it('сегмент «Вручную | Автоматически», поле задержки и ползунок при auto, подсказка «?»', () => {
    const html = renderToStaticMarkup(<NodeSceneStart tData={{ scene: demoCafeScene }} onChange={vi.fn()} />)
    expect(html).toContain('aria-label="Запуск"')
    expect(html).toMatch(/aria-checked="true"[^>]*>Автоматически</)
    expect(html).toMatch(/aria-checked="false"[^>]*>Вручную</)
    expect(html).toContain('Задержка после появления, мс')
    expect(html).toContain('type="number"')
    expect(html).toContain('type="range"')
    expect(html).toContain('value="500"')
    expect(html).toContain('max="5000"')
    expect(html).toContain('nodeStatLinkHelp')
    expect(html).toContain('Включить звук')
  })
  it('вручную — поля задержки нет', () => {
    const html = renderToStaticMarkup(<NodeSceneStart tData={{ scene: demoCafeScene, start: 'manual', startDelayMs: 900 }} onChange={vi.fn()} />)
    expect(html).toMatch(/aria-checked="true"[^>]*>Вручную</)
    expect(html).not.toContain('type="number"')
    expect(html).not.toContain('Задержка после появления')
  })
})
