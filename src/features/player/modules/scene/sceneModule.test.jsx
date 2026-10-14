import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolveModule } from '../index.js'
import SceneModule from './SceneModule.jsx'
import { sceneCircleFit, ringOffset, CIRCLE_CENTER_Y } from './sceneCircleFit.js'
import { shouldSceneYield } from './useSceneSolo.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

// deviceTier щупает WebGL/localStorage при импорте — в node не нужен
vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../../scene/v2/scene-v2-cat.css', () => ({}))

const node = (td, extra = {}) => ({ id: 'n1', seq: 1, type: 'scene', typeData: { scene: td }, triggers: [{ if: 'played', then: null }], ...extra })

describe('нода scene в плеере', () => {
  it('resolveModule(\'scene\') отдаёт SceneModule', () => {
    expect(resolveModule('scene')).toBe(SceneModule)
  })

  it('режим bubble: пузырь как у видео, живая сцена, кнопка ▶ до старта', () => {
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene })} onDone={() => {}} />)
    expect(html).toContain('playerMsgBubble--video')
    expect(html).toContain('playerMsgBubble--scene')
    expect(html).toContain('scn scn--live')
    expect(html).toContain('playerScenePlay')
    expect(html).toContain('data-status="idle"')
    expect(html).not.toContain('circleWrap')
  })

  it('режим circle: круглая рамка кружка, сцена кадрирована, кольцо, без точек прогресса', () => {
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, mode: 'circle' })} onDone={() => {}} />)
    expect(html).toContain('playerMsgRowCircle')
    expect(html).toContain('circleWrap playerSceneCircle')
    expect(html).toContain('playerSceneCircleInner')
    expect(html).toContain('circleRingSvg')
    expect(html).toContain('role="button"')
    expect(html).not.toContain('scn__progress')
  })

  it('история — статичный последний кадр без режиссёра и без кнопки ▶', () => {
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene }, { isHistory: true })} onDone={() => {}} />)
    expect(html).toContain('scn scn--static')
    expect(html).not.toContain('scn--live')
    expect(html).not.toContain('playerScenePlay')
    expect(html).toContain(demoOfficeScene.timeline.at(-1).text)
  })

  it('облачки выключены — текста реплики в кадре нет', () => {
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, showBubbles: false }, { isHistory: true })} onDone={() => {}} />)
    expect(html).not.toContain('scn-bubble')
  })

  it('невалидная сцена → фолбэк: реплики текстом, «Дальше», ошибки только админу', () => {
    const bad = { ...demoOfficeScene, version: 1 }
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: bad })} onDone={() => {}} />)
    expect(html).toContain('data-scene-fallback')
    expect(html).toContain('Дальше')
    expect(html).toContain(demoOfficeScene.timeline[0].text)
    expect(html).not.toContain('playerSceneFbErrors')
    const admin = renderToStaticMarkup(<SceneModule node={node({ scene: bad })} adminPreview onDone={() => {}} />)
    expect(admin).toContain('playerSceneFbErrors')
    expect(admin).toContain('version')
  })

  it('сцена не выбрана → фолбэк «Сцена не выбрана»; предрисовка (pending) — без кнопки', () => {
    expect(renderToStaticMarkup(<SceneModule node={node({})} onDone={() => {}} />)).toContain('Сцена не выбрана')
    expect(renderToStaticMarkup(<SceneModule node={node({})} pending onDone={() => {}} />)).not.toContain('Дальше')
  })
})

describe('sceneCircleFit — кадрирование 9:16 в круг', () => {
  it('сцена шире круга и сдвинута так, что центр кадра — на головах котов', () => {
    const st = sceneCircleFit(200)
    const w = parseFloat(st.width), h = parseFloat(st.height), left = parseFloat(st.left), top = parseFloat(st.top)
    expect(w).toBeCloseTo(200 * 360 / 340, 1)
    expect(h).toBeCloseTo(w * 16 / 9, 1)
    expect(left).toBeCloseTo(-(w - 200) / 2, 1) // по горизонтали по центру
    // точка сцены CIRCLE_CENTER_Y (между облачком и головами) — в центре круга
    expect(top + CIRCLE_CENTER_Y / 640 * h).toBeCloseTo(100, 1)
    // головы котов (y≈444…520) и облачко (y≈300…384) внутри круга по вертикали
    const yOf = y => top + y / 640 * h
    expect(yOf(444)).toBeGreaterThan(0)
    expect(yOf(520)).toBeLessThan(200)
    expect(yOf(300)).toBeGreaterThan(0)
  })

  it('кольцо прогресса: idle пусто, ended полное, середина — по репликам', () => {
    const C = 100
    expect(ringOffset({ status: 'idle', index: 0, total: 4 }, C)).toBe(C)
    expect(ringOffset({ status: 'ended', index: 3, total: 4 }, C)).toBe(0)
    expect(ringOffset({ status: 'playing', index: 1, total: 4 }, C)).toBeCloseTo(C * (1 - 1.5 / 4))
    expect(ringOffset({ status: 'playing', index: 0, total: 0 }, C)).toBe(C)
  })
})

describe('useSceneSolo — чужой звук ставит сцену на паузу', () => {
  const media = (muted, voice = false) => ({ muted, pause() {}, hasAttribute: a => voice && a === 'data-voice' })
  it('голосовое со звуком — да; немая петля кружка — нет; свой аудио-элемент — нет', () => {
    const own = media(false)
    expect(shouldSceneYield(media(false), own)).toBe(true)
    expect(shouldSceneYield(media(true), own)).toBe(false)
    expect(shouldSceneYield(media(true, true), own)).toBe(true) // голосовое при mute урока — всё равно речь
    expect(shouldSceneYield(own, own)).toBe(false)
    expect(shouldSceneYield({}, own)).toBe(false)
  })
})
