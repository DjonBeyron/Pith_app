import { describe, it, expect } from 'vitest'
import { normalizeTask, validateTask, taskAnswers, taskPrompt, TASK_LIMITS } from './sceneTask.js'
import { taskGrammar, taskExpectedPhrases, checkSpeechAnswer, taskNeedsMic, taskModeLabel, MAX_TASK_GRAMMAR } from './sceneTaskVoice.js'
import { validateSceneV2, normalizeSceneV2 } from './sceneSchemaV2.js'
import { lintScene } from './sceneLint.js'
import { sceneLegendText, sceneLegend } from './sceneLegend.js'
import { demoCafeScene } from './demoScenes.js'

const clone = s => JSON.parse(JSON.stringify(s))
const scene = task => {
  const s = clone(demoCafeScene)
  s.timeline = [
    { who: 'a', text: 'What would you like to drink?', emotion: 'happy' },
    { who: 'b', text: "I'd like a cup of tea, please.", emotion: 'neutral' },
    { who: 'a', text: 'Nice to meet you!', emotion: 'happy' },
  ]
  s.task = task
  return s
}
const repeat = { kind: 'repeat', lineIndex: 1, accept: ['I would like tea please'] }
const say = { kind: 'say', lineIndex: 0, answers: ['I want tea', 'Coffee please'], accept: ['Tea please'], keywords: ['tea'] }
const L1 = scene(repeat).timeline[1]
const L0 = scene(say).timeline[0]

describe('нормализация / валидация голосовых видов', () => {
  it('repeat: answers/keywords игнорируются, passRatio и strict сохраняются', () => {
    const t = normalizeTask({ ...repeat, answers: ['x'], keywords: ['y'], passRatio: 0.8, strict: true })
    expect(t).toEqual({ kind: 'repeat', lineIndex: 1, accept: ['I would like tea please'], passRatio: 0.8, strict: true })
  })
  it('say: лимиты, дедуп, плохой passRatio отбрасывается', () => {
    const t = normalizeTask({ kind: 'say', answers: [' a ', 'a', '', 5, ...'bcdefghij'], keywords: Array.from({ length: 20 }, (_, i) => `k${i}`), passRatio: 0.3, strict: 'yes' })
    expect(t.answers).toHaveLength(TASK_LIMITS.maxAnswers)
    expect(t.keywords).toHaveLength(TASK_LIMITS.maxKeywords)
    expect(t.passRatio).toBeUndefined()
    expect(t.strict).toBeUndefined()
    expect(normalizeTask({ kind: 'say' })).toEqual({ kind: 'say', lineIndex: null, accept: [], answers: [] })
  })
  it('translate не получает голосовых полей', () => {
    expect(normalizeTask({ kind: 'translate', answers: ['x'], strict: true })).toEqual({ kind: 'translate', lineIndex: null, accept: [] })
  })
  it('validate: хорошие и плохие', () => {
    for (const t of [repeat, say]) { const e = []; validateTask(t, 3, e); expect(e).toEqual([]) }
    const e = []
    validateTask({ kind: 'say', answers: ['', 'x'.repeat(141), ...Array(8).fill('a')], keywords: [1, 'k'.repeat(41), ...Array(12).fill('k')], passRatio: 2, strict: 'да' }, 3, e)
    for (const p of ['task.answers[0]', 'task.answers[1]', 'task.answers —', 'task.keywords[0]', 'task.keywords[1]', 'task.keywords —', 'task.passRatio', 'task.strict']) {
      expect(e.some(x => x.startsWith(p)), p).toBe(true)
    }
    const e2 = []; validateTask({ kind: 'sing' }, 3, e2); expect(e2[0]).toMatch(/task\.kind/)
  })
  it('сцена с say/repeat валидна и нормализуется; старая translate не меняется', () => {
    expect(validateSceneV2(scene(say))).toEqual([])
    expect(normalizeSceneV2(scene(repeat)).task.kind).toBe('repeat')
    expect(validateSceneV2(scene({ kind: 'translate', accept: [] }))).toEqual([])
  })
  it('эталоны, вопрос, метки', () => {
    expect(taskAnswers(repeat, L1)).toEqual(["I'd like a cup of tea, please.", 'I would like tea please'])
    expect(taskAnswers(say, L0)).toEqual(['I want tea', 'Coffee please', 'Tea please'])
    expect(taskExpectedPhrases(say, L0)).toHaveLength(3)
    const s = scene(repeat); s.characters.b.name = 'Мурка'
    expect(taskPrompt(repeat, s, s.timeline[1])).toBe('Повтори за Мурка')
    expect(taskPrompt(say, { characters: {} }, {})).toBe('Ответь коту')
    expect(taskPrompt(repeat, { characters: {} }, {})).toBe('Повтори за диктором')
    expect(taskNeedsMic(say)).toBe(true); expect(taskNeedsMic(repeat)).toBe(true)
    expect(taskNeedsMic({ kind: 'translate' })).toBe(false); expect(taskNeedsMic(null)).toBe(false)
    expect(taskModeLabel('translate')).toBe('О чём диалог'); expect(taskModeLabel('say')).toBe('Ответь коту'); expect(taskModeLabel('repeat')).toBe('Повтори за диктором')
  })
})

describe('taskGrammar', () => {
  it('эталон первым, дедуп, нормализация, без знаков и регистра', () => {
    const g = taskGrammar(repeat, L1)
    expect(g[0]).toBe("i'd like a cup of tea please")
    expect(new Set(g).size).toBe(g.length)
    expect(g.every(p => p === p.toLowerCase() && !/[.,!?]/.test(p))).toBe(true)
    expect(g.length).toBeLessThanOrEqual(MAX_TASK_GRAMMAR)
  })
  it('say: answers, accept и keywords попадают в словарь; кириллица и translate пропускаются', () => {
    const g = taskGrammar(say, L0)
    expect(g).toEqual(expect.arrayContaining(['i want tea', 'coffee please', 'tea please', 'tea']))
    expect(taskGrammar({ kind: 'say', answers: ['Чай, пожалуйста'] }, L0)).toEqual([])
    expect(taskGrammar({ kind: 'translate' }, L0)).toEqual([])
  })
  it('лимит MAX_TASK_GRAMMAR', () => {
    const many = { kind: 'say', answers: Array.from({ length: 8 }, (_, i) => `I am playing with cats number ${i} and dogs`), accept: Array.from({ length: 8 }, (_, i) => `He plays with birds ${i} and goes home`) }
    expect(taskGrammar(many, L0).length).toBeLessThanOrEqual(MAX_TASK_GRAMMAR)
  })
})

describe('checkSpeechAnswer', () => {
  it('repeat: точное, регистр/знаки, accept', () => {
    expect(checkSpeechAnswer(repeat, L1, ["I'd like a cup of tea please"])).toMatchObject({ ok: true, score: 1, missingKeys: [], empty: false })
    expect(checkSpeechAnswer(repeat, L1, ['i would like a cup of tea please']).ok).toBe(true)
    expect(checkSpeechAnswer(repeat, L1, ['I would like tea please']).best).toBe('I would like tea please')
  })
  it('repeat: опечатки ASR прощаются, strict — нет', () => {
    const typo = ["I'd lik a cap of tee pleas"]
    expect(checkSpeechAnswer(repeat, L1, typo).ok).toBe(true)
    expect(checkSpeechAnswer({ ...repeat, strict: true }, L1, typo).ok).toBe(false)
  })
  it('repeat: частичное / мусор / пусто / [unk]', () => {
    const r = checkSpeechAnswer(repeat, L1, ['a cup of'])
    expect(r.ok).toBe(false); expect(r.missingKeys.length).toBeGreaterThan(0)
    expect(checkSpeechAnswer({ ...repeat, passRatio: 0.5 }, L1, ['a cup of tea']).ok).toBe(true)
    expect(checkSpeechAnswer(repeat, L1, ['banana dance monkey']).ok).toBe(false)
    expect(checkSpeechAnswer(repeat, L1, ['']).empty).toBe(true)
    expect(checkSpeechAnswer(repeat, L1, []).ok).toBe(false)
    expect(checkSpeechAnswer(repeat, L1, ['[unk]']).empty).toBe(true)
    expect(checkSpeechAnswer(repeat, L1, null).ok).toBe(false)
  })
  it('решение по главному варианту (первому)', () => {
    expect(checkSpeechAnswer(repeat, L1, ['nothing here', "I'd like a cup of tea please"]).ok).toBe(false)
  })
  it('say по answers (без keywords)', () => {
    const t = { kind: 'say', answers: ['I want tea'], accept: ['Tea please'] }
    expect(checkSpeechAnswer(t, L0, ['i want tea']).ok).toBe(true)
    expect(checkSpeechAnswer(t, L0, ['tea please']).best).toBe('Tea please')
    expect(checkSpeechAnswer(t, L0, ['i hate rain']).ok).toBe(false)
  })
  it('say по keywords: свободная фраза засчитывается', () => {
    expect(checkSpeechAnswer(say, L0, ['well i think maybe tea would be great']).ok).toBe(true)
    expect(checkSpeechAnswer(say, L0, ['i am fine thanks']).ok).toBe(false)
    const two = { kind: 'say', answers: [], keywords: ['tea', 'milk', 'sugar'] }
    expect(checkSpeechAnswer(two, L0, ['tea with milk and sugar']).ok).toBe(true)
    const part = checkSpeechAnswer(two, L0, ['tea with milk'])
    expect(part.ok).toBe(false); expect(part.missingKeys).toEqual(['sugar']); expect(part.matched).toEqual(['tea', 'milk'])
    expect(checkSpeechAnswer({ ...two, passRatio: 0.6 }, L0, ['tea with milk']).ok).toBe(true)
    expect(checkSpeechAnswer({ ...two, strict: true }, L0, ['tee with milk and sugar']).ok).toBe(false)
  })
  it('не голосовой вид → не ок', () => {
    expect(checkSpeechAnswer({ kind: 'translate' }, L0, ['hello']).ok).toBe(false)
  })
})

describe('линтер и легенда', () => {
  const lint = task => lintScene(scene(task)).filter(x => x.text.startsWith('task'))
  it('say без answers и keywords — ошибка; с keywords — нет', () => {
    expect(lint({ kind: 'say', lineIndex: 0 }).some(x => x.level === 'error')).toBe(true)
    expect(lint({ kind: 'say', lineIndex: 0, keywords: ['tea'], hint: 'h' }).some(x => x.level === 'error')).toBe(false)
  })
  it('repeat: нет текста — ошибка; длинная реплика, passRatio — warn', () => {
    const s = scene({ kind: 'repeat', lineIndex: 1 }); s.timeline[1].text = ' '
    expect(lintScene(s).some(x => x.level === 'error' && x.text.includes('повторять нечего'))).toBe(true)
    const s2 = scene({ kind: 'repeat', lineIndex: 1, passRatio: 0.55 })
    s2.timeline[1].text = 'one two three four five six seven eight nine ten eleven twelve thirteen.'
    const w = lintScene(s2).filter(x => x.level === 'warn').map(x => x.text)
    expect(w.some(t => t.includes('повторить вслух трудно'))).toBe(true)
    expect(w.some(t => t.includes('task.passRatio'))).toBe(true)
  })
  it('say без hint — warn; хорошее say/repeat без ошибок', () => {
    expect(lint({ kind: 'say', lineIndex: 0, answers: ['tea'] }).some(x => x.text.startsWith('task.hint'))).toBe(true)
    expect(lintScene(scene({ ...say, hint: 'напиток' })).filter(x => x.level === 'error')).toEqual([])
    expect(lintScene(scene(repeat)).filter(x => x.level === 'error')).toEqual([])
  })
  it('легенда описывает say/repeat', () => {
    const t = sceneLegendText()
    expect(t).toContain('"repeat"'); expect(t).toContain('task.answers'); expect(t).toContain('Примеры голосовых заданий')
    expect(Object.keys(sceneLegend().taskExamples)).toEqual(['translate', 'say', 'repeat'])
  })
})
