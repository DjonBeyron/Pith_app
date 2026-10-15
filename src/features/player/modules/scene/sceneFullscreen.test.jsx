import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  fsFrameSize, fsOpenTransition, fsCloseTransition, isFsCloseGesture, inlineTapAction, SCENE_FS_Z, SCENE_FS_SWIPE_CLOSE_PX,
} from './sceneFullscreenModel.js'
import { createDirector } from '../../../scene/v2/directorCore.js'
import SceneBubbleView from './SceneBubbleView.jsx'
import SceneCircleView from './SceneCircleView.jsx'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../../scene/v2/scene-v2.css', () => ({}))
vi.mock('../../../scene/v2/scene-v2-cat.css', () => ({}))

describe('полный экран сцены — чистая модель', () => {
  it('кадр 9:16 по центру рамки: высокий экран — по ширине, широкий — по высоте', () => {
    expect(fsFrameSize({ w: 390, h: 844 })).toEqual({ width: 390, height: 693 })
    expect(fsFrameSize({ w: 1440, h: 900 })).toEqual({ width: 506, height: 900 })
    expect(fsFrameSize({ w: 0, h: 0 })).toEqual({ width: 0, height: 0 })
  })

  it('открытие: та же реплика и play; после конца — с начала', () => {
    expect(fsOpenTransition({ status: 'playing', index: 2 })).toEqual({ index: 2, play: true })
    expect(fsOpenTransition({ status: 'paused', index: 1 })).toEqual({ index: 1, play: true })
    expect(fsOpenTransition({ status: 'ended', index: 4 })).toEqual({ index: 0, play: true })
    expect(fsOpenTransition(null)).toEqual({ index: 0, play: true })
  })

  it('закрытие: играла → лента продолжает с той же реплики; пауза → стоит на ней; доиграла → последняя без автозапуска', () => {
    expect(fsCloseTransition({ status: 'playing', index: 3, total: 5 })).toEqual({ index: 3, resume: true })
    expect(fsCloseTransition({ status: 'paused', index: 3, total: 5 })).toEqual({ index: 3, resume: false })
    expect(fsCloseTransition({ status: 'ended', index: 4, total: 5 })).toEqual({ index: 4, resume: false })
    expect(fsCloseTransition({ status: 'idle', index: 0, total: 1 })).toEqual({ index: 0, resume: false })
  })

  it('жесты закрытия: свайп вниз больше порога, Escape; вверх/короткий/другая клавиша — нет', () => {
    expect(isFsCloseGesture({ dy: SCENE_FS_SWIPE_CLOSE_PX + 1 })).toBe(true)
    expect(isFsCloseGesture({ dy: 40 })).toBe(false)
    expect(isFsCloseGesture({ dy: -200 })).toBe(false)
    expect(isFsCloseGesture({ key: 'Escape' })).toBe(true)
    expect(isFsCloseGesture({ key: 'Enter' })).toBe(false)
  })

  it('тап в ленте: до старта — пуск на месте, иначе — полный экран; слои выше экранов приложения', () => {
    expect(inlineTapAction('idle')).toBe('start')
    expect(inlineTapAction('playing')).toBe('fullscreen')
    expect(inlineTapAction('paused')).toBe('fullscreen')
    expect(inlineTapAction('ended')).toBe('fullscreen')
    expect(SCENE_FS_Z.bg).toBe(10000)
    expect(SCENE_FS_Z.controls).toBeGreaterThan(SCENE_FS_Z.stage)
  })
})

describe('перенос реплики между лентой и экраном — один звук', () => {
  const timeline = [{ who: 'a', text: 'Раз.' }, { who: 'b', text: 'Два.' }, { who: 'a', text: 'Три.' }]
  function dir(log, tag) {
    return createDirector({
      timeline,
      playLine: (line, i) => { log.push(`${tag}:start:${i}`); return () => log.push(`${tag}:cancel:${i}`) },
    })
  }
  it('открыть: лента на паузу (реплика отменена), экран с той же реплики; закрыть: экран гаснет, лента play(from)', () => {
    const log = []
    const inline = dir(log, 'in'), fs = dir(log, 'fs')
    inline.play(); inline.goTo(1)
    const open = fsOpenTransition(inline.getState())
    inline.pause()
    fs.goTo(open.index); fs.play()
    expect(log).toEqual(['in:start:0', 'in:cancel:0', 'in:start:1', 'in:cancel:1', 'fs:start:1'])
    // звучит один: лента отменила свою реплику до старта экрана
    expect(inline.getState().status).toBe('paused')
    expect(fs.getState()).toMatchObject({ status: 'playing', index: 1 })
    fs.goTo(2)
    const close = fsCloseTransition(fs.getState())
    fs.pause(); fs.destroy()
    expect(close).toEqual({ index: 2, resume: true })
    inline.play(close.index)
    expect(inline.getState()).toMatchObject({ status: 'playing', index: 2 })
    expect(log.slice(5)).toEqual(['fs:cancel:1', 'fs:start:2', 'fs:cancel:2', 'in:start:2'])
  })

  it('directorCore.play(from): из паузы и после конца — с указанной реплики; мусор — как раньше', () => {
    const log = []
    const d = dir(log, 'd')
    d.play(); d.pause()
    d.play(2)
    expect(d.getState()).toMatchObject({ status: 'playing', index: 2 })
    d.pause(); d.play(99)
    expect(d.getState().index).toBe(2)
    d.pause(); d.play({ type: 'click' })
    expect(d.getState()).toMatchObject({ status: 'playing', index: 2 })
  })
})

describe('чип «Включить звук» в пузыре и кружке', () => {
  const base = {
    scene: demoOfficeScene, showBubbles: true, isHistory: false, pending: false, status: 'playing', index: 0, total: 3,
    paused: false, sound: false, rate: 1, apiRef: { current: null }, rootRef: { current: null }, onState: () => {}, onTap: () => {},
  }
  it('soundChip → кнопка с текстом, значка mute нет; без чипа при sound=false — значок mute', () => {
    const chip = renderToStaticMarkup(<SceneBubbleView {...base} soundChip onEnableSound={() => {}} />)
    expect(chip).toContain('data-scene-sound-chip')
    expect(chip).toContain('Включить звук')
    expect(chip).not.toContain('videoMutedIcon')
    const mute = renderToStaticMarkup(<SceneBubbleView {...base} />)
    expect(mute).toContain('videoMutedIcon')
    expect(mute).not.toContain('data-scene-sound-chip')
    const circle = renderToStaticMarkup(<SceneCircleView {...base} soundChip onEnableSound={() => {}} />)
    expect(circle).toContain('data-scene-sound-chip')
    expect(circle).not.toContain('circleMutedIcon')
  })
})
