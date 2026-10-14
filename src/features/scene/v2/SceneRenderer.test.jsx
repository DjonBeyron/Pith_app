import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneRenderer from './SceneRenderer.jsx'
import { demoOfficeScene, demoCafeScene } from './demoScenes.js'
import { normalizeSceneV2 } from './sceneSchemaV2.js'

// deviceTier щупает WebGL/localStorage при импорте — в node не нужен
vi.mock('../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('./scene-v2.css', () => ({}))
vi.mock('./scene-v2-cat.css', () => ({}))

const office = normalizeSceneV2(demoOfficeScene)
const cafe = normalizeSceneV2(demoCafeScene)

describe('SceneRenderer — статичный режим', () => {
  it('кадр без анимационных классов, рот закрыт, оба кота и предметы на месте', () => {
    const html = renderToStaticMarkup(<SceneRenderer scene={office} mode="static" />)
    expect(html).toContain('class="scn scn--static"')
    expect(html).not.toContain('scn--live')
    expect(html).not.toContain('is-talking')
    expect(html).not.toContain('scn__progress')
    expect(html.match(/data-mouth="closed"/g)).toHaveLength(2)
    expect(html).toContain('data-who="a"')
    expect(html).toContain('data-who="b"')
    expect(html).toContain('data-gender="male"')
    expect(html).toContain('data-gender="female"')
    expect(html).toContain('data-slot="desk-left"')
    expect(html).toContain('data-part="laptop"')
    expect(html).toContain('data-location="office"')
    expect(html).not.toContain('scn-bubble')
  })

  it('frameIndex показывает реплику кадром: облачко и эмоция говорящего', () => {
    const html = renderToStaticMarkup(<SceneRenderer scene={office} mode="static" frameIndex={1} />)
    expect(html).toContain('scn-bubble scn-bubble--b')
    expect(html).toContain('Видела. Поэтому я с утра на третьей кружке кофе.')
    expect(html).toContain('Дымка')
    // облачко выключено опцией
    const noBubble = renderToStaticMarkup(<SceneRenderer scene={office} mode="static" frameIndex={1} showBubbles={false} />)
    expect(noBubble).not.toContain('scn-bubble')
  })

  it('пустые слоты пропускаются; кафе рисует стойку и свои предметы', () => {
    const html = renderToStaticMarkup(<SceneRenderer scene={{ ...cafe, slots: { ...cafe.slots, ceiling: null } }} mode="static" />)
    expect(html).not.toContain('data-slot="ceiling"')
    expect(html).toContain('data-part="counter"')
    expect(html).toContain('data-part="coffee-machine"')
    expect(html).toContain('data-location="cafe"')
  })

  it('lite — класс scn--lite; все три виземы присутствуют у каждого кота', () => {
    const html = renderToStaticMarkup(<SceneRenderer scene={office} mode="static" lite />)
    expect(html).toContain('scn--lite')
    expect(html.match(/data-viseme="open"/g)).toHaveLength(2)
    expect(html.match(/data-viseme="half"/g)).toHaveLength(2)
    expect(html.match(/data-viseme="closed"/g)).toHaveLength(2)
  })
})

describe('SceneRenderer — live (первый кадр, без эффектов)', () => {
  it('класс scn--live, статус idle, точки прогресса по числу реплик, облачка ещё нет', () => {
    const html = renderToStaticMarkup(<SceneRenderer scene={office} mode="live" onTap={() => {}} />)
    expect(html).toContain('scn--live')
    expect(html).toContain('data-status="idle"')
    expect(html).toContain('role="button"')
    expect(html.match(/scn__dot/g)).toHaveLength(office.timeline.length)
    expect(html).not.toContain('scn-bubble')
    expect(html).toContain('data-speaking=""')
  })

  it('paused/неактивна — класс scn--paused (анимации стоят)', () => {
    expect(renderToStaticMarkup(<SceneRenderer scene={office} paused />)).toContain('scn--paused')
    expect(renderToStaticMarkup(<SceneRenderer scene={office} active={false} />)).toContain('scn--paused')
    expect(renderToStaticMarkup(<SceneRenderer scene={office} />)).not.toContain('scn--paused')
  })

  it('children рисуются поверх (оверлей старта)', () => {
    const html = renderToStaticMarkup(<SceneRenderer scene={office}><button>Старт</button></SceneRenderer>)
    expect(html).toContain('<button>Старт</button>')
  })
})
