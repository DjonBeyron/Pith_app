import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolveModule } from '../index.js'
import SceneModule from './SceneModule.jsx'
import { sceneCircleFit, CIRCLE_CENTER_Y } from './sceneCircleFit.js'
import { shouldSceneYield } from './useSceneSolo.js'
import { sceneAudioSrcOf } from './sceneNodeAudio.js'
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
    expect(html).toContain('playerSceneRing')
    expect(html).toContain('role="button"')
    expect(html).not.toContain('scn__progress')
  })

  it('режим «вручную» и «авто» до старта рисуются одинаково: кадр стоит, ▶ поверх, полного экрана нет', () => {
    const manual = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, start: 'manual' })} onDone={() => {}} />)
    expect(manual).toContain('playerScenePlay')
    expect(manual).toContain('data-status="idle"')
    expect(manual).not.toContain('playerSceneFsStage')
    expect(manual).not.toContain('data-scene-sound-chip')
    const auto = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, start: 'auto', startDelayMs: 1200 })} onDone={() => {}} />)
    expect(auto).toContain('playerScenePlay')
    expect(auto).not.toContain('playerSceneFsStage')
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
  it('прогрев тишиной в жесте (data:-wav незаглушённый, primedAudio/sounds) — не чужой звук, сцену на паузу не ставит', () => {
    const own = media(false)
    const prime = { ...media(false), src: 'data:audio/wav;base64,UklGRiQAAABXQVZF' }
    expect(shouldSceneYield(prime, own)).toBe(false)
    expect(shouldSceneYield({ ...media(false), src: 'blob:x', currentSrc: 'data:audio/wav;base64,AA' }, own)).toBe(false)
    expect(shouldSceneYield({ ...media(false), src: 'https://r2/voice.mp3' }, own)).toBe(true)
  })
})

describe('sceneAudioSrcOf — blob прогрева для озвучки реплик', () => {
  it('ссылка → blob из lessonFiles (ключ — сама ссылка); выгружен/ошибка/нет → null; без записей — null', () => {
    const files = [
      { id: 'f1', blobUrl: 'blob:voice' },
      { id: 'https://r2/a.mp3', blobUrl: 'blob:a' },
      { id: 'https://r2/b.mp3', blobUrl: 'blob:b', evicted: true },
      { id: 'https://r2/c.mp3', blobUrl: null, error: true },
    ]
    const srcOf = sceneAudioSrcOf(files)
    expect(srcOf('https://r2/a.mp3')).toBe('blob:a')
    expect(srcOf('https://r2/b.mp3')).toBeNull()
    expect(srcOf('https://r2/c.mp3')).toBeNull()
    expect(srcOf('https://r2/zzz.mp3')).toBeNull()
    expect(sceneAudioSrcOf([{ id: 'f1', blobUrl: 'blob:voice' }])).toBeNull()
    expect(sceneAudioSrcOf(null)).toBeNull()
  })
})

describe('crop ноды scene в плеере (масштаб/сдвиг как у видео)', () => {
  it('bubble: без crop слоя нет (DOM как у старых нод); с crop — слой с transform вокруг сцены', () => {
    const plain = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene })} onDone={() => {}} />)
    expect(plain).not.toContain('playerSceneCrop')
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, crop: { x: 20, y: 0, scale: 1.5 } })} onDone={() => {}} />)
    expect(html).toContain('playerSceneCrop')
    expect(html).toContain('translate(10%, 0%) scale(1.5)')
    // сцена внутри слоя, рамка снаружи
    expect(html.indexOf('playerSceneFrame')).toBeLessThan(html.indexOf('playerSceneCrop'))
    expect(html.indexOf('playerSceneCrop')).toBeLessThan(html.indexOf('scn scn--live'))
  })

  it('circle: crop сдвигает и масштабирует содержимое круга; умолчание не меняет разметку', () => {
    // Кадр круга — окно viewBox сцены (sceneCircleViewBox), слой сцены — размером с круг (inset:0), а не гигантская обёртка
    const inner = h => h.match(/class="scn__svg" viewBox="([^"]*)"/)[1]
    const base = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, mode: 'circle' })} onDone={() => {}} />)
    const dflt = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, mode: 'circle', crop: { x: 0, y: 0, scale: 1 } })} onDone={() => {}} />)
    const zoom = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, mode: 'circle', crop: { x: 0, y: 0, scale: 2 } })} onDone={() => {}} />)
    expect(inner(dflt)).toBe(inner(base))
    expect(inner(zoom)).not.toBe(inner(base))
    const side = h => parseFloat(inner(h).split(' ')[2])
    expect(side(zoom)).toBeCloseTo(side(base) / 2, 1)
    expect(base).toContain('class="playerSceneCircleInner" style="position:absolute;inset:0"')
  })

  it('circle: тап раскрывает кружок как видео (кнопка, кольцо-дуга без CSS-transition, нет полного экрана и подложки)', () => {
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, mode: 'circle' })} onDone={() => {}} />)
    expect(html).toContain('role="button"')
    expect(html).toContain('data-arc="r"')
    expect(html).toContain('data-arc="l"')
    expect(html).not.toContain('stroke-dashoffset')
    expect(html).not.toContain('circleBackdrop')
    expect(html).not.toContain('playerMsgBubble--circle--expanded')
    expect(html).not.toContain('playerSceneFsStage')
  })

  it('circle в истории: ни кнопки, ни обработчиков раскрытия', () => {
    const html = renderToStaticMarkup(<SceneModule node={node({ scene: demoOfficeScene, mode: 'circle' }, { isHistory: true })} onDone={() => {}} />)
    expect(html).not.toContain('role="button"')
    expect(html).toContain('data-status="history"')
  })
})
