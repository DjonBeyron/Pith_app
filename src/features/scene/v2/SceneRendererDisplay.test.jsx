import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneRenderer from './SceneRenderer.jsx'
import SceneBubbleV2 from './SceneBubbleV2.jsx'
import { demoOfficeScene } from './demoScenes.js'
import { normalizeSceneV2 } from './sceneSchemaV2.js'

vi.mock('../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('./scene-v2.css', () => ({}))
vi.mock('./scene-v2-cat.css', () => ({}))

// Режимы показа текста (sceneOptions.js): none / text / both, приоритет задания, переопределения
const withTr = normalizeSceneV2({
  ...demoOfficeScene,
  timeline: demoOfficeScene.timeline.map((l, i) => (i === 1 ? { ...l, text: 'Seen it.', translation: 'Видела.' } : l)),
})
const sceneWith = options => ({ ...withTr, options: { ...withTr.options, ...options } })
const frame = (scene, props = {}) => renderToStaticMarkup(<SceneRenderer scene={scene} mode="static" frameIndex={1} {...props} />)

describe('SceneRenderer — режимы показа текста', () => {
  it("по умолчанию 'text': облачко с оригиналом, без перевода; data-display на корне", () => {
    const html = frame(withTr)
    expect(html).toContain('data-display="text"')
    expect(html).toContain('scn-bubble__text">Seen it.')
    expect(html).not.toContain('scn-bubble__tr')
    // старое options.bubbles: false → 'none'
    expect(frame(sceneWith({ bubbles: false }))).not.toContain('scn-bubble')
    expect(frame(sceneWith({ bubbles: false }))).toContain('data-display="none"')
  })

  it("'none' — облачка нет; 'both' — оригинал и перевод под ним; реплика без translation — только оригинал", () => {
    expect(frame(sceneWith({ display: 'none' }))).not.toContain('scn-bubble')
    const both = frame(sceneWith({ display: 'both' }))
    expect(both).toContain('data-display="both"')
    expect(both).toContain('scn-bubble__text">Seen it.')
    expect(both).toContain('scn-bubble__tr">Видела.')
    const noTr = renderToStaticMarkup(<SceneRenderer scene={sceneWith({ display: 'both' })} mode="static" frameIndex={0} />)
    expect(noTr).toContain('scn-bubble__text')
    expect(noTr).not.toContain('scn-bubble__tr')
  })

  it('задание «О чём диалог» перекрывает both: перевода в облачке нет', () => {
    const task = { kind: 'translate', lineIndex: 1, accept: [] }
    const html = frame({ ...sceneWith({ display: 'both' }), task })
    expect(html).toContain('data-display="text"')
    expect(html).toContain('Seen it.')
    expect(html).not.toContain('scn-bubble__tr')
    // и при переопределении пропом both — тоже
    expect(frame({ ...withTr, task }, { display: 'both' })).not.toContain('scn-bubble__tr')
  })

  it('пропсы-переопределения: display главнее options и showBubbles; showBubbles=false → без облачка', () => {
    expect(frame(sceneWith({ display: 'none' }), { display: 'both' })).toContain('scn-bubble__tr">Видела.')
    expect(frame(sceneWith({ display: 'both' }), { display: 'text' })).not.toContain('scn-bubble__tr')
    expect(frame(sceneWith({ display: 'both' }), { showBubbles: false })).not.toContain('scn-bubble')
    expect(frame(sceneWith({ display: 'both' }), { showBubbles: true })).toContain('scn-bubble__tr')
    expect(frame(sceneWith({ display: 'none' }), { showBubbles: true })).toContain('scn-bubble__text')
  })

  it('live-кадр: display/voice-пропсы принимаются, статус idle, облачка ещё нет', () => {
    const html = renderToStaticMarkup(<SceneRenderer scene={sceneWith({ display: 'both' })} mode="live" voice={{ translation: true }} display="both" />)
    expect(html).toContain('data-status="idle"')
    expect(html).toContain('data-display="both"')
    expect(html).not.toContain('scn-bubble')
    expect(html).not.toContain('data-phase')
  })
})

describe('SceneBubbleV2 — перевод и фаза', () => {
  const line = { who: 'a', text: 'Hi.', translation: 'Привет.' }
  it('showTranslation показывает перевод; phase translation — data-phase на облачке', () => {
    const plain = renderToStaticMarkup(<SceneBubbleV2 line={line} name="Кот" />)
    expect(plain).toContain('Hi.')
    expect(plain).not.toContain('scn-bubble__tr')
    expect(plain).not.toContain('data-phase')
    const tr = renderToStaticMarkup(<SceneBubbleV2 line={line} name="Кот" showTranslation phase="translation" />)
    expect(tr).toContain('scn-bubble__tr">Привет.')
    expect(tr).toContain('data-phase="translation"')
    expect(renderToStaticMarkup(<SceneBubbleV2 line={{ who: 'a', text: 'Hi.' }} showTranslation />)).not.toContain('scn-bubble__tr')
    expect(renderToStaticMarkup(<SceneBubbleV2 line={line} visible={false} />)).toBe('')
  })
})
