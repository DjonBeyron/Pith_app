import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneRenderer from './SceneRenderer.jsx'
import { sceneStaticMarkup } from './staticMarkup.js'
import { demoOfficeScene, demoCafeScene } from './demoScenes.js'
import { normalizeSceneV2 } from './sceneSchemaV2.js'

vi.mock('../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('./scene-v2.css', () => ({}))
vi.mock('./scene-v2-cat.css', () => ({}))

// Внутренность <svg> у статики (строка) и у живого рендера (React) — один и тот же набор узлов
const inner = html => html.slice(html.indexOf('<svg'), html.indexOf('</svg>'))
const sig = html => ({
  tags: (html.match(/<(g|path|rect|circle|ellipse|line|polyline|polygon|text)\b/g) ?? []).length,
  parts: (html.match(/data-part="/g) ?? []).length,
  slots: (html.match(/data-slot="/g) ?? []).length,
})

describe('статичный кадр одной строкой (staticMarkup.js)', () => {
  for (const [name, raw] of [['office', demoOfficeScene], ['cafe', demoCafeScene]]) {
    it(`${name}: те же узлы и части, что у живого рендера`, () => {
      const scene = normalizeSceneV2(raw)
      const live = renderToStaticMarkup(<SceneRenderer scene={scene} mode="live" active={false} />)
      const stat = renderToStaticMarkup(<SceneRenderer scene={scene} mode="static" />)
      expect(sig(inner(stat))).toEqual(sig(inner(live)))
      expect(inner(stat)).toContain('data-who="a"')
      expect(inner(stat)).toContain('data-who="b"')
      expect(sig(inner(stat)).tags).toBeLessThanOrEqual(250)
    })
  }

  it('эмоция говорящего берётся из реплики кадра; кэш — на сцену и номер кадра', () => {
    const scene = normalizeSceneV2(demoOfficeScene)
    const a = sceneStaticMarkup(scene, scene.timeline[0], 0)
    const b = sceneStaticMarkup(scene, scene.timeline[1], 1)
    expect(a).not.toBe(b)
    expect(sceneStaticMarkup(scene, scene.timeline[0], 0)).toBe(a)
  })

  it('в статике нет анимационных хвостов живого кота (is-talking, --idle-delay)', () => {
    const scene = normalizeSceneV2(demoOfficeScene)
    const html = sceneStaticMarkup(scene, scene.timeline[0], 0)
    expect(html).not.toContain('is-talking')
    expect(html).not.toContain('--idle-delay')
  })
})
