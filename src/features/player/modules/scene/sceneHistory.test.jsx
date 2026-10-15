import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneModule from './SceneModule.jsx'
import SceneBody from './SceneBody.jsx'
import { pickAllowed, sceneFrameKind, SCENE_LIVE_CAP, SCENE_LIVE_CAP_WEAK } from './sceneNearModel.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../../scene/v2/scene-v2-cat.css', () => ({}))

const node = (extra = {}, td = {}) => ({
  id: 'n1', seq: 1, type: 'scene', typeData: { scene: { scene: demoOfficeScene, ...td } }, triggers: [], ...extra,
})
const css = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const tags = html => (html.match(/<[a-z]/g) ?? []).length

describe('сцена в истории — замороженный кадр', () => {
  it('пузырь и кружок: статичный кадр, без живого рендерера, точек прогресса и класса «говорит»', () => {
    for (const mode of ['bubble', 'circle']) {
      const html = renderToStaticMarkup(<SceneModule node={node({ isHistory: true }, { mode })} onDone={() => {}} />)
      expect(html).toContain('scn scn--static')
      expect(html).not.toContain('scn--live')
      expect(html).not.toContain('scn__progress')
      expect(html).not.toContain('is-talking')
      expect(html).not.toContain('playerScenePlay') // ▶ у истории нет
      expect(html).toContain('data-status="history"')
    }
  })

  it('история не получает onTap/кнопку: тапа и полного экрана нет', () => {
    const html = renderToStaticMarkup(<SceneModule node={node({ isHistory: true })} onDone={() => {}} />)
    expect(html).not.toContain('role="button"')
  })

  it('рамка у статики и у плашки одна: плашка — один div без детей, ≤ 3 узлов вместо ~190', () => {
    const base = { scene: demoOfficeScene, isHistory: true, ended: false, last: 0, showBubbles: true, display: null, voice: null, showProgress: false, live: {} }
    const frozen = renderToStaticMarkup(<SceneBody {...base} near />)
    const placeholder = renderToStaticMarkup(<SceneBody {...base} near={false} />)
    expect(placeholder).toBe('<div class="scn scn--ph" aria-hidden="true"></div>')
    expect(tags(placeholder)).toBeLessThanOrEqual(3)
    expect(tags(frozen)).toBeGreaterThan(100)
    expect(tags(frozen)).toBeLessThan(260) // бюджет ≤ 250 узлов на сцену
  })

  it('доигравшая сцена тоже замирает: статика с тапом (полный экран), живой рендерер снят', () => {
    const base = { scene: demoOfficeScene, isHistory: false, ended: true, near: true, last: 2, showBubbles: true, display: null, voice: null, showProgress: true, live: {}, onTap: () => {} }
    const html = renderToStaticMarkup(<SceneBody {...base} />)
    expect(html).toContain('scn scn--static')
    expect(html).toContain('role="button"')
    expect(html).not.toContain('scn--live')
  })

  it('ещё не доигравшая сцена всегда живая — плашкой её нельзя заменить', () => {
    expect(sceneFrameKind({ isHistory: false, ended: false, near: false })).toBe('live')
    expect(sceneFrameKind({ isHistory: true, near: false })).toBe('placeholder')
    expect(sceneFrameKind({ isHistory: true, near: true })).toBe('static')
    expect(sceneFrameKind({ ended: true, near: false })).toBe('placeholder')
  })
})

describe('лимит живых SVG-сцен', () => {
  const it3 = (i, top) => ({ id: i, top, bottom: top + 400, near: true })
  it('видимые рисуются всегда, соседи — до бюджета (3), ближайшие к центру экрана', () => {
    const items = [it3('a', -900), it3('b', -420), it3('c', 100), it3('d', 560), it3('e', 980)]
    const m = pickAllowed(items, { vh: 812 })
    expect([...m.keys()].sort()).toEqual(['b', 'c', 'd'])
    expect(m.get('c')).toBe('view')
    expect(m.get('d')).toBe('view')
    expect(m.get('b')).toBe('extra')
    expect(m.size).toBeLessThanOrEqual(SCENE_LIVE_CAP)
  })

  it('не рисует то, что вне зоны запаса; на слабом — видимые + один сосед (≤ 2)', () => {
    const items = [{ id: 'far', top: 3000, bottom: 3400, near: false }, it3('v', 200), it3('x', 640 + 200), it3('y', -420)]
    expect(pickAllowed(items, { vh: 812 }).has('far')).toBe(false)
    const weak = pickAllowed([it3('v', 200), it3('y', -420), it3('z', 700 + 200)], { vh: 812, cap: SCENE_LIVE_CAP_WEAK })
    expect(weak.size).toBeLessThanOrEqual(2)
  })

  it('видимых больше бюджета (три на экране 375×812) — рисуются все: плашки на виду быть не должно', () => {
    const m = pickAllowed([it3('a', -200), it3('b', 220), it3('c', 640)], { vh: 812, cap: SCENE_LIVE_CAP_WEAK })
    expect(m.size).toBe(3)
  })
})

describe('замороженная сцена: ни одной CSS-анимации', () => {
  // Каждое правило с animation: (кроме none/play-state) должно относиться к .scn--live
  function animatedSelectors(text) {
    const out = []
    text = text.replace(/\/\*[\s\S]*?\*\//g, '')
    const re = /([^{}]+)\{([^{}]*)\}/g
    let m
    while ((m = re.exec(text))) {
      const decl = m[2]
      if (/(^|;|\s)animation\s*:\s*(?=\S)(?!none\b)/.test(decl) || /animation-name\s*:\s*(?=\S)(?!none\b)/.test(decl)) out.push(m[1].trim())
    }
    return out
  }
  it('scene-v2-cat.css и scene-v2.css: анимации только у .scn--live', () => {
    for (const f of ['../../../scene/v2/scene-v2-cat.css', '../../../scene/v2/scene-v2.css']) {
      const sel = animatedSelectors(css(f))
      expect(sel.length).toBeGreaterThan(0)
      for (const s of sel) expect(s, `${f}: ${s}`).toContain('.scn--live')
    }
  })
  it('плашка и кадр рамки не анимируются (только ▶ и чип звука — они у живой сцены)', () => {
    const t = css('../../../../styles/player/modules/scene.css')
    expect(t).toContain('.scn--ph')
    expect(animatedSelectors(t).every(s => /playerScenePlay|playerSceneSoundChip/.test(s) && !s.includes('.scn'))).toBe(true)
  })
})
