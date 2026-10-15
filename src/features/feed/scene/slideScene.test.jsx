import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SlideScene from './SlideScene.jsx'
import SlideMedia from './SlideMedia.jsx'
import SlideSceneChips from './SlideSceneChips.jsx'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { demoOfficeScene } from '../../scene/v2/demoScenes.js'
import { setFeedSlow, getFeedSlowKey } from '../feedSlowState.js'
import { shouldPrefetchNear, firstAudioUrl, firstAudioUrls } from './useSceneAudioPrefetch.js'

// deviceTier щупает WebGL/localStorage при импорте — в node не нужен
vi.mock('../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../scene/v2/scene-v2-cat.css', () => ({}))
// Стор сцен подменяем: статус задаёт тест
const feedScene = vi.hoisted(() => ({ value: { status: 'idle', scene: null } }))
vi.mock('./useFeedScene.js', () => ({ useFeedScene: () => feedScene.value }))

const scene = normalizeSceneV2(demoOfficeScene)
const base = { scene, slideKey: 7, moduleId: 'm1', soundOn: false, soundEverOn: false }

describe('SlideScene — окно ленты', () => {
  it('активный слайд — живая сцена без точек прогресса, тап-слой и чип звука новичку', () => {
    const html = renderToStaticMarkup(<SlideScene {...base} active near />)
    expect(html).toContain('slideSceneRoot')
    expect(html).toContain('data-mode="live"')
    expect(html).toContain('scn scn--live')
    expect(html).not.toContain('scn__progress')
    expect(html).toContain('feedSoundChip')
    expect(html).toContain('Включить звук')
  })

  it('сосед — статичный кадр без облачка, без чипов; далёкий — скелетон (или постер)', () => {
    const near = renderToStaticMarkup(<SlideScene {...base} near />)
    expect(near).toContain('data-mode="static"')
    expect(near).toContain('scn scn--static')
    expect(near).not.toContain('scn-bubble')
    expect(near).not.toContain('feedSoundChip')
    const far = renderToStaticMarkup(<SlideScene {...base} />)
    expect(far).toContain('feedSkeleton')
    expect(far).not.toContain('class="scn')
    const poster = renderToStaticMarkup(<SlideScene {...base} posterUrl="https://x/p.jpg" />)
    expect(poster).toContain('feedPosterBg')
  })

  it('скрытая вкладка: активный слайд не живой (режиссёр не создаётся, речи нет)', () => {
    const html = renderToStaticMarkup(<SlideScene {...base} active near tabVisible={false} />)
    expect(html).toContain('data-mode="static"')
    expect(html).toContain('scn scn--static')
    expect(html).not.toContain('scn--live')
  })

  it('кто уже включал звук — чип только на паузе', () => {
    const html = renderToStaticMarkup(<SlideScene {...base} active near soundEverOn />)
    expect(html).not.toContain('feedSoundChip')
  })
})

describe('SlideSceneChips — иконка паузы и чипы (чистые пропсы)', () => {
  it('пауза: иконка play + «Выключить звук» при звуке; неактивному слайду ничего', () => {
    const on = renderToStaticMarkup(<SlideSceneChips paused active soundOn soundEverOn />)
    expect(on).toContain('slidePauseIcon')
    expect(on).toContain('Выключить звук')
    const off = renderToStaticMarkup(<SlideSceneChips paused active soundOn={false} soundEverOn />)
    expect(off).toContain('Включить звук')
    expect(renderToStaticMarkup(<SlideSceneChips paused active={false} soundOn={false} />)).toBe('')
  })
})

describe('SlideMedia — ветка сцена/видео', () => {
  const props = { ...base, scene: undefined, videoUrl: null, posterUrl: null, active: true, near: true, fallback: <i>видео-заглушка</i> }

  it('без sceneId — видео (здесь его нет → заглушка); loading → постер/скелетон без мигания', () => {
    feedScene.value = { status: 'idle', scene: null }
    expect(renderToStaticMarkup(<SlideMedia {...props} />)).toContain('видео-заглушка')
    feedScene.value = { status: 'loading', scene: null }
    const wait = renderToStaticMarkup(<SlideMedia {...props} sceneId="s1" />)
    expect(wait).toContain('data-media="wait"')
    expect(wait).toContain('feedSkeleton')
    expect(wait).not.toContain('видео-заглушка')
  })

  it('missing/invalid → прежнее видео; ready → сцена', () => {
    feedScene.value = { status: 'missing', scene: null }
    expect(renderToStaticMarkup(<SlideMedia {...props} sceneId="s1" />)).toContain('видео-заглушка')
    feedScene.value = { status: 'invalid', scene: null }
    expect(renderToStaticMarkup(<SlideMedia {...props} sceneId="s1" />)).toContain('видео-заглушка')
    feedScene.value = { status: 'ready', scene }
    const html = renderToStaticMarkup(<SlideMedia {...props} sceneId="s1" />)
    expect(html).toContain('slideSceneRoot')
    expect(html).toContain('scn--live')
  })
})

describe('feedSlowState — замедление по slideKey', () => {
  it('включение/выключение, чужой ключ не сбрасывает', () => {
    setFeedSlow(3, true)
    expect(getFeedSlowKey()).toBe(3)
    setFeedSlow(5, false)
    expect(getFeedSlowKey()).toBe(3)
    setFeedSlow(3, false)
    expect(getFeedSlowKey()).toBeNull()
  })
})

describe('useSceneAudioPrefetch — подкачка озвучки соседнего слайда (чистые правила)', () => {
  it('первая реплика соседа: только near и не active, сеть не в экономии, видео не буферизуется', () => {
    const url = 'https://r2/a.mp3'
    expect(shouldPrefetchNear({ url, active: false, near: true, allowed: true, videoActive: false })).toBe(true)
    expect(shouldPrefetchNear({ url, active: true, near: true, allowed: true, videoActive: false })).toBe(false) // активный — сам режиссёр
    expect(shouldPrefetchNear({ url, active: false, near: false, allowed: true, videoActive: false })).toBe(false) // далёкий — ничего
    expect(shouldPrefetchNear({ url, active: false, near: true, allowed: false, videoActive: false })).toBe(false) // saveData/2g
    expect(shouldPrefetchNear({ url, active: false, near: true, allowed: true, videoActive: true })).toBe(false)
    expect(shouldPrefetchNear({ url: null, active: false, near: true, allowed: true, videoActive: false })).toBe(false)
    expect(firstAudioUrl({ timeline: [{ audioUrl: url }, { audioUrl: 'https://r2/b.mp3' }] })).toBe(url)
    expect(firstAudioUrl({ timeline: [{ text: 'без файла' }] })).toBeNull()
    expect(firstAudioUrl(null)).toBeNull()
  })
  it('firstAudioUrls: файл перевода первой реплики — только при включённой озвучке перевода у сцены', () => {
    const tl = [{ audioUrl: 'https://r2/a.mp3', translationAudioUrl: 'https://r2/a-tr.mp3' }, { audioUrl: 'https://r2/b.mp3' }]
    expect(firstAudioUrls({ timeline: tl })).toEqual(['https://r2/a.mp3'])
    expect(firstAudioUrls({ timeline: tl, options: { voice: { translation: true } } })).toEqual(['https://r2/a.mp3', 'https://r2/a-tr.mp3'])
    expect(firstAudioUrls({ timeline: [{ text: 'x', translationAudioUrl: 'https://r2/t.mp3' }], options: { voice: { translation: true } } })).toEqual(['https://r2/t.mp3'])
    expect(firstAudioUrls(null)).toEqual([])
  })
})
