import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SlideMedia from './SlideMedia.jsx'
import { pickSlideMedia } from './slideSceneRules.js'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { demoTemplateScene, demoOfficeScene } from '../../scene/v2/demoScenes.js'
import { resolveUserValues, resetUserValues } from '../../scene/v2/sceneUserResolve.js'

// Слова пользователя в ленте: пока значения не готовы, режиссёр не монтируется (скелетон), готовы — сцена со словом из памяти,
// аварийный выключатель — запасное слово сразу, сцена без vars не затронута
vi.mock('../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../scene/v2/scene-v2-cat.css', () => ({}))
// Рендерер подменяем: видно, какую сцену (и какой текст первой реплики) получил режиссёр
vi.mock('../../scene/v2/SceneRenderer.jsx', () => ({ default: ({ scene }) => <div className="scn scn--live" data-line={scene?.timeline?.[0]?.text} /> }))
const feedScene = vi.hoisted(() => ({ value: { status: 'idle', scene: null } }))
vi.mock('./useFeedScene.js', () => ({ useFeedScene: () => feedScene.value }))
const flag = vi.hoisted(() => ({ on: true }))
vi.mock('../../../shared/lib/memory/sceneVarsConfig.js', async orig => ({ ...(await orig()), isSceneVarsEnabled: () => flag.on }))

const template = normalizeSceneV2(demoTemplateScene)
const plain = normalizeSceneV2(demoOfficeScene)
const props = { sceneId: 's-food', slideKey: 1, moduleId: 'm', soundOn: false, soundEverOn: false, videoUrl: null, posterUrl: null }
const WORDS = [{ key: 'cheese', text: 'cheese', translation: 'сыр', level: 1, due: false, step: 1 }]

beforeEach(() => { resetUserValues(); flag.on = true; feedScene.value = { status: 'ready', scene: template } })

describe('pickSlideMedia — ожидание слов', () => {
  it('готовая сцена, но слова ещё не готовы — wait (скелетон); без параметра ready — как раньше', () => {
    expect(pickSlideMedia({ sceneId: 'x', status: 'ready', ready: false })).toBe('wait')
    expect(pickSlideMedia({ sceneId: 'x', status: 'ready', ready: true })).toBe('scene')
    expect(pickSlideMedia({ sceneId: 'x', status: 'ready' })).toBe('scene')
    expect(pickSlideMedia({ sceneId: 'x', status: 'missing', ready: false })).toBe('video')
  })
})

describe('SlideMedia — сцена-шаблон в ленте', () => {
  it('слова ещё не готовы: режиссёр не монтируется, виден скелетон', () => {
    const html = renderToStaticMarkup(<SlideMedia {...props} active near />)
    expect(html).toContain('data-media="wait"')
    expect(html).not.toContain('class="scn')
  })
  it('слова готовы (решение уже есть): сцена монтируется со словом пользователя, а не запасным', async () => {
    await resolveUserValues(template, { key: 's-food', load: async () => ({ words: WORDS, error: null }), ensureAudio: async () => false, prefetch: () => {} })
    const html = renderToStaticMarkup(<SlideMedia {...props} active near />)
    expect(html).not.toContain('data-media="wait"')
    expect(html).toContain('scn scn--live')
    expect(html).toContain('data-line="Can I have cheese, please?"')
  })
  it('слайд вне окна ленты слов не ждёт и не грузит: скелетон', () => {
    const html = renderToStaticMarkup(<SlideMedia {...props} />)
    expect(html).not.toContain('scn--live')
    expect(html).not.toContain('cheese')
  })
  it('аварийный выключатель: запасное слово сразу, без ожидания', () => {
    flag.on = false
    const html = renderToStaticMarkup(<SlideMedia {...props} active near />)
    expect(html).toContain('scn scn--live')
    expect(html).toContain('data-line="Can I have a sandwich, please?"')
  })
  it('сцена без vars: ни ожидания, ни изменений', () => {
    feedScene.value = { status: 'ready', scene: plain }
    const html = renderToStaticMarkup(<SlideMedia {...props} active near />)
    expect(html).toContain('scn scn--live')
    expect(html).not.toContain('data-media="wait"')
  })
})
