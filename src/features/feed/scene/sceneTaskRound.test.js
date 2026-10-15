import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createDirector } from '../../scene/v2/directorCore.js'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { demoRepeatOneLineScene, demoCafeScene } from '../../scene/v2/demoScenes.js'
import { loopedScene } from './slideSceneRules.js'
import { initialPlay, trackPlay, roundOver } from './sceneTaskPlay.js'

// Сцена с заданием и панель задания: (1) под выехавшей панелью сцена стоит — второй круг не стартует, пока панель в DOM;
// (2) панель не трогает геометрию сцены — только переменные слайда для иконок и гашение блока фразы.

// Режиссёр ленты по loopedScene: playLine копит onEnd, starts — какие реплики (индексы) стартовали
function feedDirector(scene, onState) {
  const s = loopedScene(normalizeSceneV2(scene))
  const ends = []
  const starts = []
  const d = createDirector({ timeline: s.timeline, loop: !!s.options.loop, playLine: (_l, i, { onEnd }) => { starts.push(i); ends.push(onEnd); return () => {} }, onChange: onState })
  return { d, starts, finishLine: () => ends.shift()?.() }
}

describe('сцена с заданием: первый круг → стоп, панель, потом круг заново', () => {
  it.each([
    ['одна реплика («Повтори»)', demoRepeatOneLineScene],
    ['несколько реплик', { ...demoCafeScene, task: { kind: 'repeat', lineIndex: 1, accept: [] } }],
  ])('%s: после последней реплики режиссёр на ended, нулевая не стартует; done — по ended', (_n, scene) => {
    const states = []
    const { d, starts, finishLine } = feedDirector(scene, st => states.push(st))
    const total = d.getState().total
    let p = initialPlay()
    d.play()
    for (let i = 0; i < total; i++) { p = trackPlay(p, d.getState()); expect(p.done).toBe(false); finishLine() }
    const last = d.getState()
    expect(last.status).toBe('ended')
    expect(last.index).toBe(total - 1) // сцена стоит на последней реплике — панель выезжает на ней
    expect(starts).toHaveLength(total) // второй круг не начался
    expect(roundOver(last)).toBe(true)
    p = trackPlay(p, last)
    expect(p.done).toBe(true)
    // Панель в DOM — ничего не играет само; панель ушла → play: круг с нулевой реплики
    expect(starts).toHaveLength(total)
    d.play()
    expect(d.getState()).toMatchObject({ status: 'playing', index: 0 })
    expect(starts).toHaveLength(total + 1)
    d.destroy()
  })
  it('без задания сцена зациклена как раньше: ended не наступает, нулевая стартует сама', () => {
    const { d, starts, finishLine } = feedDirector(demoCafeScene, () => {})
    const total = d.getState().total
    d.play()
    for (let i = 0; i < total; i++) finishLine()
    expect(d.getState()).toMatchObject({ status: 'playing', index: 0 })
    expect(starts).toHaveLength(total + 1)
    expect(roundOver(d.getState())).toBe(false)
    d.destroy()
  })
})

describe('панель задания не двигает сцену', () => {
  const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const catchCss = read('../../../styles/feed-catch.css')
  const taskCss = read('../../../styles/feed-scene-task.css')
  const voiceCss = read('../../../styles/feed-scene-voice.css')
  const cover = read('./SceneTaskCover.jsx')
  it('накрытие — absolute у низа навигации, уезжает transform-ом; правила [data-scene-task] только гасят (opacity/visibility)', () => {
    const block = catchCss.match(/\.catchCover\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).toContain('position: absolute')
    expect(block).toContain('transform: translateY(105%)')
    for (const css of [taskCss, voiceCss]) {
      for (const rule of css.matchAll(/\[data-scene-task\][^{]*\{([^}]*)\}/g)) {
        expect(rule[1]).not.toMatch(/transform|height|margin|padding|top:|bottom:|--sf-|--pause-y/)
      }
      expect(css).not.toMatch(/\.scn\b|\.slideSceneRoot|\.scn__svg/)
    }
  })
  it('SceneTaskCover пишет на слайд только --catch-cover-h / --catch-icon-ms / data-scene-task и снимает их при уходе', () => {
    const props = [...cover.matchAll(/setProperty\('([^']+)'/g)].map(m => m[1])
    expect(new Set(props)).toEqual(new Set(['--catch-cover-h', '--catch-icon-ms']))
    expect(cover).not.toMatch(/--sf-|scrollTop|scrollIntoView|\.focus\(/)
    expect(cover).toContain("closest('.feedSlide')")
    expect(cover).toContain("removeAttribute('data-scene-task')")
    // снятие — при размонтировании (после анимации ухода), а не в начале ухода (sceneTaskCloseOrder.test.js)
    expect(cover).toMatch(/slide\.style\.setProperty\('--catch-cover-h', '0px'\)[\s\S]*slide\.removeAttribute\('data-scene-task'\)/)
  })
})
