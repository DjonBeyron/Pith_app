import { describe, it, expect } from 'vitest'
import { checkSceneRules, sceneVoiceNeeds } from './lessonLintSceneRules.js'
import { lintLesson } from './lessonLint.js'
import { demoPitCircleScene, demoCafeScene } from '../../scene/v2/demoScenes.js'
import { validateSceneV2 } from '../../scene/v2/sceneValidate.js'
import { lintErrors } from '../../scene/v2/sceneLint.js'

const line = (text, who = 'a') => ({ who, text, emotion: 'happy' })
const pit = (lines = ['Hi! Know how to say «try»?', 'Let us try it.']) => ({ ...demoPitCircleScene, timeline: lines.map(t => line(t)) })
const duo = (lines = ["I'm trying to cook.", 'It tries to burn!']) => ({ ...demoCafeScene, timeline: lines.map((t, i) => line(t, i % 2 ? 'b' : 'a')) })
const sc = (ref, seq, scene, mode = 'bubble', extra = {}) => ({ ref, seq, type: 'scene', data: { scene, mode, ...extra }, triggers: [] })
const text = (ref, seq) => ({ ref, seq, type: 'text', data: { content: 'мост' }, triggers: [] })
// Хороший урок-слово «try»: кружок Пита — текст — диалог — текст — кружок Пита
const good = () => [sc('n1', 1, pit(), 'circle'), text('n2', 2), sc('n3', 3, duo()), text('n4', 4), sc('n5', 5, pit(['Now you try it.', 'Ready?']), 'circle')]
const T = { title: 'try' }
// R-scene-silent (реплики без файла — беззвучно) есть почти у всех образцов ниже (они без озвучки) — проверяется отдельным тестом
const codes = (nodes, opts = T) => checkSceneRules(nodes, opts).map(s => s.match(/^\[(R-[\w-]+)\]/)[1] + (s.includes('ошибка') ? ':e' : ':w')).filter(c => !c.startsWith('R-scene-silent'))

describe('правила сцен урока-слова (S1–S4, S7, S8)', () => {
  it('образцы из демо проходят validateSceneV2 (на них держится AUTHORING_NOTES)', () => {
    for (const s of [pit(), duo()]) {
      expect(validateSceneV2(s)).toEqual([])
      expect(lintErrors(s)).toEqual([])
    }
  })
  it('хороший урок — чисто; урок без сцен и Старт/Финал не трогаем', () => {
    expect(checkSceneRules(good(), T).filter(w => !w.includes('[R-scene-silent]'))).toEqual([]) // образец без озвучки: только R-scene-silent
    expect(checkSceneRules([text('n1', 1)], T)).toEqual([])
    expect(checkSceneRules([sc('n1', 1, duo(), 'bubble')], { title: 'Старт' })).toEqual([])
    expect(checkSceneRules([sc('n1', 1, duo(), 'bubble')], { title: 'Финал' })).toEqual([])
  })
  it('S1: первая и последняя — кружок Пита', () => {
    const n = good()
    n[0] = sc('n1', 1, pit(), 'bubble')
    expect(codes(n)).toEqual(['R-scene-open:e'])
    const m = good()
    m[4] = sc('n5', 5, duo(), 'circle')
    expect(codes(m)).toEqual(['R-scene-open:e'])
    const o = good()
    o[0] = sc('n1', 1, { ...pit(), characters: { a: { ...demoPitCircleScene.characters.a, name: 'Мурка' } } }, 'circle')
    expect(codes(o)).toEqual(['R-scene-open:w'])
  })
  it('S2: 2–4 сцены и не подряд', () => {
    expect(codes([sc('n1', 1, pit(), 'circle')])).toEqual(['R-scene-count:e'])
    const five = [...good(), text('n6', 6), sc('n7', 7, duo()), text('n8', 8)]
    five.splice(4, 0, sc('n9', 4.5, duo()), text('n10', 4.6))
    expect(codes(five)).toContain('R-scene-count:e')
    const adj = good()
    adj.splice(1, 1) // n1 и n3 рядом
    expect(codes(adj)).toEqual(['R-scene-count:e'])
    const viaTrigger = good()
    viaTrigger[0].triggers = [{ if: 'played', then: 'n3' }]
    expect(codes(viaTrigger)).toEqual(['R-scene-count:e'])
  })
  it('S1/S2 без заголовка урока — мягкие (предупреждения)', () => {
    expect(codes([sc('n1', 1, duo(), 'bubble')], {})).toEqual(['R-scene-open:w', 'R-scene-open:w', 'R-scene-count:w'])
  })
  it('S3: целевое слово в каждой сцене (любая форма), иначе предупреждение', () => {
    expect(codes(good(), { title: 'try' })).toEqual([])
    const n = good()
    n[2] = sc('n3', 3, duo(['Hello there.', 'Hi, friend!']))
    expect(codes(n)).toEqual(['R-scene-word:w'])
    expect(codes(n, { title: 'To' })).toEqual([]) // служебное слово (to, the, with…) в репликах не требуем
    expect(codes(good(), { title: 'Trying' })).toEqual([]) // регистр и форма: Trying → trying/try… «tr»
  })
  it('S4: 2–6 реплик, ≤ 12 слов; в кружке Пита ровно 2', () => {
    const many = good()
    many[0] = sc('n1', 1, pit(['try 1', 'try 2', 'try 3']), 'circle')
    expect(codes(many)).toEqual(['R-scene-lines:e'])
    const six = good()
    six[2] = sc('n3', 3, duo(Array.from({ length: 6 }, () => 'try it')))
    expect(codes(six)).toEqual([])
    const seven = good()
    seven[2] = sc('n3', 3, { ...duo(Array.from({ length: 6 }, () => 'try it')), timeline: Array.from({ length: 7 }, (_, i) => line('try it', i % 2 ? 'b' : 'a')) })
    expect(codes(seven)).toEqual(['R-scene-lines:e'])
    const long = good()
    long[2] = sc('n3', 3, duo(['try one two three four five six seven eight nine ten eleven twelve', 'ok']))
    expect(codes(long)).toEqual(['R-scene-lines:e'])
    const twelve = good()
    twelve[2] = sc('n3', 3, duo(['try one two three four five six seven eight nine ten eleven', 'ok']))
    expect(codes(twelve)).toEqual([])
    const one = good()
    one[2] = sc('n3', 3, { ...duo(), timeline: [line('try it')] })
    expect(codes(one)).toContain('R-scene-lines:e')
    const pitOne = good()
    pitOne[0] = sc('n1', 1, pit(['try it']), 'circle')
    expect(codes(pitOne)).toEqual(['R-scene-lines:e'])
  })
  it('S7: без task; середина — два кота в bubble', () => {
    const t = good()
    t[2] = sc('n3', 3, { ...duo(), task: { kind: 'repeat', lineIndex: 0, accept: ['x'] } })
    expect(codes(t)).toEqual(['R-scene-task:e'])
    const circ = good()
    circ[2] = sc('n3', 3, duo(), 'circle')
    expect(codes(circ)).toEqual(['R-scene-middle:e'])
    const solo = good()
    solo[2] = sc('n3', 3, pit(['try it', 'try']), 'bubble')
    expect(codes(solo)).toEqual(['R-scene-middle:e'])
  })
  it('S8: придуманный audioUrl (без audioMeta) — предупреждение; реплики без аудио — needsVoice', () => {
    const fake = good()
    fake[2] = sc('n3', 3, { ...duo(), timeline: [{ ...line('try it'), audioUrl: 'https://x.y/a.mp3' }, line('try', 'b')] })
    expect(codes(fake)).toEqual(['R-scene-voice:w'])
    const real = good()
    real[2] = sc('n3', 3, { ...duo(), timeline: [{ ...line('try it'), audioUrl: 'https://x.y/a.mp3', audioMeta: { hash: 'h', voiceId: 'v' } }, line('try', 'b')] })
    expect(codes(real)).toEqual([])
    expect(sceneVoiceNeeds(real)).toEqual([{ ref: 'n1', lines: 2 }, { ref: 'n3', lines: 1 }, { ref: 'n5', lines: 2 }])
    expect(sceneVoiceNeeds([text('n1', 1)])).toEqual([])
  })
  it('S8: реплики без файла озвучки — предупреждение R-scene-silent (синтез устройства в плеере выключен)', () => {
    const real = good()
    real[2] = sc('n3', 3, { ...duo(), timeline: [{ ...line('try it'), audioUrl: 'https://x.y/a.mp3', audioMeta: { hash: 'h', voiceId: 'v' } }, { ...line('try', 'b'), audioUrl: 'https://x.y/b.mp3', audioMeta: { hash: 'h', voiceId: 'v' } }] })
    const silent = checkSceneRules(real, T).filter(w => w.includes('[R-scene-silent]'))
    expect(silent.map(w => w.split(' ')[1])).toEqual(['n1', 'n5']) // n3 озвучена полностью
    expect(silent[0]).toContain('предупреждение')
    expect(silent[0]).toContain('беззвучно')
  })
  it('подключено в lintLesson: заголовок решает, урок-слово это или Старт', () => {
    const nodes = [sc('n1', 1, duo(), 'bubble')]
    expect(lintLesson(nodes, { title: 'try' }).some(w => w.includes('[R-scene-open]') && w.includes('ошибка'))).toBe(true)
    expect(lintLesson(nodes, { title: 'Старт' }).some(w => w.includes('S1'))).toBe(false)
  })
})
