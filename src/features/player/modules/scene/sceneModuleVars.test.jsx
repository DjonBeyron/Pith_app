import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneModule from './SceneModule.jsx'
import { demoTemplateScene, demoOfficeScene } from '../../../scene/v2/demoScenes.js'
import { resolveUserValues, resetUserValues } from '../../../scene/v2/sceneUserResolve.js'
import { warmUserSceneNodes, sceneNodeKey } from '../../../scene/v2/warmUserScenes.js'
import { planSceneDurations, lineDurationMs } from './sceneProgressPlan.js'
import { fillUserScene } from '../../../scene/v2/sceneUserFill.js'
import { normalizeSceneV2 } from '../../../scene/v2/sceneSchemaV2.js'
import { setWordAudioSource } from '../../../../shared/lib/wordAudio/wordAudioLookup.js'
import { fallbackMs } from '../../../scene/v2/linePlayback.js'

// Слова пользователя в уроке и карточке повтора (тот же SceneModule): значения готовы ДО режиссёра, прогрев нод, кольцо с сегментами
vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../../scene/v2/scene-v2-cat.css', () => ({}))
vi.mock('../../../scene/v2/SceneRenderer.jsx', () => ({ default: ({ scene }) => <div className="scn" data-line={scene?.timeline?.[0]?.text} /> }))
const flag = vi.hoisted(() => ({ on: true }))
vi.mock('../../../../shared/lib/memory/sceneVarsConfig.js', async orig => ({ ...(await orig()), isSceneVarsEnabled: () => flag.on }))

const WORDS = [{ key: 'cheese', text: 'cheese', translation: 'сыр', level: 1, due: false, step: 1 }]
const tpl = () => JSON.parse(JSON.stringify(demoTemplateScene))
const node = (td, extra = {}) => ({ id: 'n1', seq: 1, type: 'scene', typeData: { scene: td }, triggers: [{ if: 'played', then: null }], ...extra })

beforeEach(() => { resetUserValues(); flag.on = true; setWordAudioSource(null) })

describe('SceneModule — слова пользователя', () => {
  it('значения ещё не готовы: показан запасной вариант, автозапуск ждёт (кадр стоит в idle)', () => {
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: tpl(), sceneId: 'sid' })} />)
    expect(html).toContain('data-line="Can I have a sandwich, please?"')
    expect(html).toContain('data-status="idle"')
  })
  it('значения готовы (в т.ч. прогрето заранее): сцена со словом из памяти; кружок так же', async () => {
    const scene = normalizeSceneV2(tpl())
    await resolveUserValues(scene, { key: 'sid', load: async () => ({ words: WORDS, error: null }), ensureAudio: async () => false, prefetch: () => {} })
    const bubble = renderToStaticMarkup(<SceneModule node={node({ scene: tpl(), sceneId: 'sid' })} />)
    expect(bubble).toContain('data-line="Can I have cheese, please?"')
    const circle = renderToStaticMarkup(<SceneModule node={node({ scene: tpl(), sceneId: 'sid', mode: 'circle' })} />)
    expect(circle).toContain('data-line="Can I have cheese, please?"')
    expect(circle).toContain('circleWrap')
  })
  it('нода в истории слов не ждёт: запасное слово, кадр истории', () => {
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: tpl() }, { isHistory: true })} />)
    expect(html).toContain('data-line="Can I have a sandwich, please?"')
  })
  it('аварийный выключатель: запасное слово', async () => {
    const scene = normalizeSceneV2(tpl())
    await resolveUserValues(scene, { key: 'n1', load: async () => ({ words: WORDS, error: null }), ensureAudio: async () => false, prefetch: () => {} })
    flag.on = false
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: tpl() })} />)
    expect(html).toContain('data-line="Can I have a sandwich, please?"')
  })
  it('сцена без vars и невалидная сцена работают как раньше', () => {
    expect(renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene })} />)).toContain('class="scn"')
    expect(renderToStaticMarkup(<SceneModule node={node({ scene: { version: 2, timeline: [] } })} />)).not.toContain('class="scn"')
  })
})

describe('warmUserSceneNodes — прогрев при открытии урока / следующей карточки', () => {
  it('греются только ноды scene с vars; ключ — sceneId или id ноды; выключатель — ничего', () => {
    const resolve = vi.fn().mockResolvedValue({})
    const nodes = [
      node({ scene: tpl(), sceneId: 'sid' }), node({ scene: demoOfficeScene }, { id: 'n2' }),
      { id: 'n3', type: 'text', typeData: {} }, node({ scene: tpl() }, { id: 'n4' }),
    ]
    expect(warmUserSceneNodes(nodes, { resolve })).toBe(2)
    expect(resolve.mock.calls.map(c => c[1].key)).toEqual(['sid', 'n4'])
    expect(sceneNodeKey(nodes[3])).toBe('n4')
    flag.on = false
    expect(warmUserSceneNodes(nodes, { resolve })).toBe(0)
  })
})

describe('кольцо прогресса — реплика-шаблон с цепочкой сегментов', () => {
  const seg = (text, ms) => ({ text, audioUrl: `https://r2/${text}.mp3`, audioMeta: { hash: 'h', durationMs: ms } })
  const withParts = () => {
    const s = tpl()
    s.timeline[0].segments = [seg('Can I have', 800), { var: 'food' }, seg(', please?', 700)]
    return normalizeSceneV2(s)
  }
  it('длительность = сумма: часть + слово из библиотеки + часть', () => {
    setWordAudioSource(k => ({ url: `https://r2/${k}.mp3`, duration: 0.6 }))
    const filled = fillUserScene(withParts(), { food: { text: 'cheese', translation: 'сыр' } })
    const line = filled.timeline[0]
    expect(line.segments.map(s => s.text)).toEqual(['Can I have', 'cheese', ', please?'])
    expect(lineDurationMs(filled, line, { rate: 1, voice: { translation: false } })).toBe(2100)
    expect(lineDurationMs(filled, line, { rate: 2, voice: { translation: false } })).toBe(1050)
    const plan = planSceneDurations(filled, { voice: { translation: false } })
    expect(plan.durations).toHaveLength(2)
    expect(plan.totalMs).toBe(plan.durations[0] + plan.durations[1])
  })
  it('слова нет в библиотеке: цепочка невозможна — оценка по тексту, как у синтеза устройства', () => {
    const filled = fillUserScene(withParts(), { food: { text: 'cheese' } })
    const line = filled.timeline[0]
    expect(lineDurationMs(filled, line, { voice: { translation: false } })).toBe(Math.max(400, Math.round(fallbackMs(line.text, 1))))
  })
})
