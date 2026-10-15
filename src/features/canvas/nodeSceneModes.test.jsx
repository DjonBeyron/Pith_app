import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import NodeSceneModes from './NodeSceneModes.jsx'
import { nodeDisplayPatch, nodeVoicePatch, nodeModeState, voiceSummary } from './scenePickerModel.js'
import { resolveSceneNode } from '../scene/v2/sceneNode.js'
import { demoCafeScene } from '../scene/v2/demoScenes.js'

// Переопределения ноды урока (typeData.scene.display / .voice) в пикере: «как в сцене» = поле не задано
describe('патчи переопределений ноды', () => {
  it('display: режим + согласованный showBubbles; «как в сцене» — поле убирается (undefined), showBubbles true', () => {
    expect(nodeDisplayPatch('none')).toEqual({ display: 'none', showBubbles: false })
    expect(nodeDisplayPatch('both')).toEqual({ display: 'both', showBubbles: true })
    expect(nodeDisplayPatch(null)).toEqual({ display: undefined, showBubbles: true })
    const td = { scene: demoCafeScene, display: 'both', ...nodeDisplayPatch(null) }
    expect(JSON.parse(JSON.stringify(td)).display).toBeUndefined()
    expect(resolveSceneNode(td).display).toBeNull()
  })
  it('voice: неполный объект; снятие последнего флага убирает объект целиком', () => {
    const p1 = nodeVoicePatch({}, 'translation', true)
    expect(p1).toEqual({ voice: { translation: true } })
    const p2 = nodeVoicePatch({ voice: p1.voice }, 'original', false)
    expect(p2.voice).toEqual({ translation: true, original: false })
    expect(nodeVoicePatch({ voice: p2.voice }, 'translation', null).voice).toEqual({ original: false })
    expect(nodeVoicePatch({ voice: { original: false } }, 'original', null)).toEqual({ voice: undefined })
    expect(resolveSceneNode({ scene: demoCafeScene, ...p2 }).voice).toEqual({ translation: true, original: false })
  })
  it('nodeModeState: null — как в сцене; мусор отбрасывается', () => {
    expect(nodeModeState({ scene: demoCafeScene })).toEqual({ display: null, original: null, translation: null })
    expect(nodeModeState({ display: 'none', voice: { translation: true, x: 1 } })).toEqual({ display: 'none', original: null, translation: true })
    expect(nodeModeState({ display: 'huge' }).display).toBeNull()
  })
  it('voiceSummary: оригинал X/N · перевод Y/M', () => {
    expect(voiceSummary(demoCafeScene)).toBe('озвучено: оригинал 0/5')
    const tl = demoCafeScene.timeline.map((l, i) => (i < 2 ? { ...l, translation: 'x', ...(i === 0 ? { translationAudioUrl: 'https://pub-1.r2.dev/a.mp3' } : {}) } : l))
    expect(voiceSummary({ ...demoCafeScene, timeline: tl })).toBe('озвучено: оригинал 0/5 · перевод 1/2')
    expect(voiceSummary({ timeline: [] })).toBe('')
  })
})

describe('NodeSceneModes — разметка', () => {
  it('три сегмента; «Как в сцене» показывает эффективное значение сцены; выбранное — aria-checked', () => {
    const onChange = vi.fn()
    const html = renderToStaticMarkup(<NodeSceneModes tData={{ scene: demoCafeScene, display: 'both', voice: { translation: true } }} scene={demoCafeScene} onChange={onChange} />)
    expect(html).toContain('aria-label="Показ текста"')
    expect(html).toContain('aria-label="Озвучка оригинала"')
    expect(html).toContain('aria-label="Озвучка перевода"')
    expect(html).toContain('Как в сцене · текст')
    expect(html).toContain('Как в сцене · вкл')
    expect(html).toContain('Как в сцене · выкл')
    expect(html).toMatch(/aria-checked="true"[^>]*>Текст \+ перевод</)
    expect(html).toMatch(/aria-label="Озвучка перевода"[\s\S]*?aria-checked="true"[^>]*>Вкл</)
    expect(html).toContain('только в этом уроке')
    expect(html).not.toContain('Облачки с текстом')
  })
})
