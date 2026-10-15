import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneRenderer from './SceneRenderer.jsx'
import { demoPitCircleScene } from './demoScenes.js'
import { normalizeSceneV2 } from './sceneSchemaV2.js'
import { CAT_PLACEMENT } from './sprites/slots.js'

// Рендер одиночной сцены (один кот Пит): один кот по центру в live/static/lite, облачко по центру (side 'c'), data-solo
vi.mock('../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('./scene-v2.css', () => ({}))
vi.mock('./scene-v2-cat.css', () => ({}))

const pit = normalizeSceneV2(demoPitCircleScene)
const soloTransform = `translate(${CAT_PLACEMENT.solo.x} ${CAT_PLACEMENT.solo.y}) scale(${CAT_PLACEMENT.scale})`

describe('SceneRenderer — одиночная сцена', () => {
  it('static: один кот (один data-mouth), по центру, data-solo на корне, b нет', () => {
    const html = renderToStaticMarkup(<SceneRenderer scene={pit} mode="static" />)
    expect(html).toContain('data-solo="1"')
    expect(html.match(/data-mouth="closed"/g)).toHaveLength(1)
    expect(html.match(/data-who="a"/g)).toHaveLength(1)
    expect(html).not.toContain('data-who="b"')
    expect(html).toContain(soloTransform)
    expect(html).toContain('data-slot="desk-left"')
  })

  it('static с кадром: облачко по центру (scn-bubble--c) с именем Пита', () => {
    const html = renderToStaticMarkup(<SceneRenderer scene={pit} mode="static" frameIndex={0} />)
    expect(html).toContain('scn-bubble scn-bubble--c')
    expect(html).toContain('Пит')
    expect(html).toContain(pit.timeline[0].text)
  })

  it('live: один кот, точки прогресса по репликам, scn--live; lite — scn--lite и три виземы одного рта', () => {
    const live = renderToStaticMarkup(<SceneRenderer scene={pit} mode="live" />)
    expect(live).toContain('scn--live')
    expect(live).toContain('data-solo="1"')
    expect(live.match(/data-who="a"/g)).toHaveLength(1)
    expect(live).not.toContain('data-who="b"')
    expect(live).toContain(soloTransform)
    expect(live.match(/scn__dot/g)).toHaveLength(pit.timeline.length)
    const lite = renderToStaticMarkup(<SceneRenderer scene={pit} mode="live" lite />)
    expect(lite).toContain('scn--lite')
    expect(lite.match(/data-viseme="open"/g)).toHaveLength(1)
  })

  it('двух котов рендер не трогает: data-solo нет, оба кота на старых местах', () => {
    const duo = normalizeSceneV2({ ...demoPitCircleScene, characters: { a: demoPitCircleScene.characters.a, b: {} } })
    const html = renderToStaticMarkup(<SceneRenderer scene={duo} mode="static" />)
    expect(html).not.toContain('data-solo')
    expect(html).toContain('data-who="b"')
    expect(html).toContain(`translate(${CAT_PLACEMENT.a.x} ${CAT_PLACEMENT.a.y})`)
  })
})
