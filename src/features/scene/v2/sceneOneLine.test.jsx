import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { minLinesFor, taskTargetLine, taskAnswers, taskPrompt } from './sceneTask.js'
import { LIMITS } from './sceneConstants.js'
import { validateSceneV2 } from './sceneValidate.js'
import { lintScene } from './sceneLint.js'
import { demoCafeScene, demoRepeatOneLineScene, demoSayOneLineScene, DEMO_SCENES } from './demoScenes.js'
import { sceneLegend, sceneLegendText } from './sceneLegend.js'
import { createDirector } from './directorCore.js'
import { feedTaskOf, initialPlay, trackPlay } from '../../feed/scene/sceneTaskPlay.js'
import { loopedScene } from '../../feed/scene/slideSceneRules.js'
import { checkScene } from '../../canvas/lesson-io/lessonLintScene.js'
import SceneModule from '../../player/modules/scene/SceneModule.jsx'

vi.mock('../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('./scene-v2.css', () => ({}))
vi.mock('./scene-v2-cat.css', () => ({}))

const clone = s => JSON.parse(JSON.stringify(s))
const withTask = (task, timeline) => ({ ...clone(demoCafeScene), timeline: timeline ?? [{ who: 'a', text: 'Hello there, friend!' }], ...(task ? { task } : {}) })
const errs = s => lintScene(s).filter(x => x.level === 'error').map(x => x.text)

describe('minLinesFor — минимум реплик зависит от задания', () => {
  it('без задания и translate — 2, say/repeat — 1', () => {
    expect(minLinesFor(withTask(null))).toBe(LIMITS.minLines)
    expect(minLinesFor(withTask({ kind: 'translate' }))).toBe(2)
    expect(minLinesFor(withTask({ kind: 'say' }))).toBe(1)
    expect(minLinesFor(withTask({ kind: 'repeat' }))).toBe(1)
    expect(minLinesFor(null)).toBe(2)
    expect(minLinesFor(withTask({ kind: 'bogus' }))).toBe(2)
  })
})

describe('валидатор и линтер: одна реплика', () => {
  it('repeat и say с одной репликой — без ошибок и без предупреждения «диалог короче 3»', () => {
    const rep = withTask({ kind: 'repeat', lineIndex: 0 })
    const say = withTask({ kind: 'say', lineIndex: 0, answers: ['Hi!'] })
    for (const s of [rep, say]) {
      expect(validateSceneV2(s)).toEqual([])
      expect(errs(s)).toEqual([])
      expect(lintScene(s).some(x => x.text.includes('короче'))).toBe(false)
    }
  })
  it('одна реплика без задания или с translate — ошибка «минимум 2» с пояснением про Повтори/Ответь', () => {
    for (const s of [withTask(null), withTask({ kind: 'translate', lineIndex: 0, accept: ['привет'] })]) {
      const e = errs(s).find(t => t.includes('минимум 2'))
      expect(e).toMatch(/Повтори.*Ответь коту.*одной/)
    }
  })
  it('пустая сцена не проходит даже с голосовым заданием (минимум 1)', () => {
    expect(errs(withTask({ kind: 'repeat' }, [])).some(t => t.includes('минимум 1'))).toBe(true)
  })
  it('любой говорящий: repeat — text реплики a или b; say — вопрос любого', () => {
    for (const who of ['a', 'b']) {
      const s = withTask({ kind: 'repeat', lineIndex: 0 }, [{ who, text: 'Nice to meet you!' }])
      expect(errs(s)).toEqual([])
      const t = taskTargetLine(s)
      expect(taskAnswers(s.task, t.line)).toEqual(['Nice to meet you!'])
      expect(taskPrompt(s.task, s, t.line)).toContain(s.characters[who].name)
      const sy = withTask({ kind: 'say', answers: ['Fine'] }, [{ who, text: 'How are you?' }])
      expect(errs(sy)).toEqual([])
      expect(feedTaskOf(sy).index).toBe(0)
    }
  })
  it('lineIndex 1 при одной реплике — ошибка (реплики №2 нет)', () => {
    expect(errs(withTask({ kind: 'repeat', lineIndex: 1 })).some(t => t.includes('№2'))).toBe(true)
  })
  it('легенда и промпт для нейросети разрешают одну реплику', () => {
    expect(sceneLegend().fields.timeline).toContain('достаточно 1 реплики')
    expect(sceneLegendText()).toMatch(/ОДНОЙ реплики/)
  })
  it('демо «Одна реплика» проходят линтер без замечаний и есть в DEMO_SCENES', () => {
    expect(lintScene(demoRepeatOneLineScene)).toEqual([])
    expect(lintScene(demoSayOneLineScene)).toEqual([])
    expect(DEMO_SCENES).toContain(demoRepeatOneLineScene)
    expect(DEMO_SCENES).toContain(demoSayOneLineScene)
    expect(demoRepeatOneLineScene.timeline).toHaveLength(1)
  })
})

describe('нода урока: lintLesson', () => {
  const node = scene => [{ ref: 'n1', type: 'scene', data: { scene }, triggers: [{ if: 'played', then: 'n2' }] }]
  it('одна реплика + repeat — без ошибок; без задания — R-scene-invalid с «минимум 2»', () => {
    expect(checkScene(node(demoRepeatOneLineScene)).filter(l => l.includes('ошибка'))).toEqual([])
    const bad = checkScene(node(withTask(null)))
    expect(bad.some(l => l.includes('R-scene-invalid') && l.includes('минимум 2'))).toBe(true)
  })
})

describe('воспроизведение одной реплики', () => {
  function make(loop) {
    const ends = []; const log = []; const states = []
    const d = createDirector({
      timeline: demoRepeatOneLineScene.timeline, loop,
      playLine: (_l, i, { onEnd, once }) => { log.push(`line${i}${once ? ':once' : ''}`); ends.push(onEnd); return () => {} },
      onChange: s => states.push(s),
    })
    return { d, ends, log, states }
  }
  it('без loop: после единственной реплики ended (нода урока шлёт played), «Заново» играет её снова', () => {
    const { d, ends, states } = make(false)
    d.play(); ends.pop()()
    expect(states.at(-1)).toMatchObject({ status: 'ended', index: 0, total: 1 })
    d.play(); expect(d.getState().status).toBe('playing')
  })
  it('playOnce(0) играет ту же реплику один раз и встаёт на паузу', () => {
    const { d, ends, log } = make(true)
    d.playOnce(0); ends.pop()()
    expect(log).toEqual(['line0:once'])
    expect(d.getState()).toMatchObject({ status: 'paused', index: 0 })
  })
  it('loop в ленте: круг детектируется после ПЕРВОГО проигрывания, ровно один показ', () => {
    const { d, ends, states } = make(true)
    let p = initialPlay(); let shown = 0
    const feed = s => { const prev = p; p = trackPlay(p, s); if (p.done && !prev.done) shown += 1 }
    states.push = s => { Array.prototype.push.call(states, s); feed(s) }
    d.play()
    expect(p.done).toBe(false) // реплика только пошла — задание не выезжает
    ends.pop()() // реплика доиграла → loop стартует её заново
    expect(shown).toBe(1)
    ends.pop()(); ends.pop()?.()
    expect(shown).toBe(1)
  })
  it('пауза посреди одной реплики сбрасывает счёт: после продолжения нужен полный проигрыш', () => {
    let p = initialPlay()
    const st = status => ({ status, index: 0, total: 1 })
    p = trackPlay(p, st('playing'))
    p = trackPlay(p, st('paused'))
    p = trackPlay(p, st('playing')) // продолжение с начала реплики — это не конец круга
    expect(p.done).toBe(false)
    expect(trackPlay(p, st('playing')).done).toBe(true)
    expect(trackPlay(initialPlay(), st('ended')).done).toBe(true) // без loop
  })
  it('лента: loopedScene одной реплики с заданием — без loop (круг кончается ended, панель до второго круга), feedTaskOf отдаёт голосовое задание', () => {
    expect(loopedScene(demoRepeatOneLineScene).options.loop).toBe(false)
    const { task: _t, ...noTask } = demoRepeatOneLineScene
    expect(loopedScene(noTask).options.loop).toBe(true)
    const info = feedTaskOf(demoSayOneLineScene)
    expect(info).toMatchObject({ index: 0, voice: true })
  })
  it('SceneModule: одна реплика — история и живой кадр рисуются, точек прогресса нет', () => {
    const node = extra => ({ id: 'n1', seq: 1, type: 'scene', typeData: { scene: { scene: demoRepeatOneLineScene } }, triggers: [{ if: 'played', then: null }], ...extra })
    const hist = renderToStaticMarkup(<SceneModule node={node({ isHistory: true })} onDone={() => {}} />)
    expect(hist).toContain('scn--static')
    expect(hist).toContain('Coffee, please!')
    const live = renderToStaticMarkup(<SceneModule node={node()} onDone={() => {}} />)
    expect(live).toContain('scn--live')
    expect(live).not.toContain('scn__progress')
  })
})
