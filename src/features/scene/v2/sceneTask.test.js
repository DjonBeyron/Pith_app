import { describe, it, expect } from 'vitest'
import {
  normalizeTask, validateTask, taskTargetLine, taskAnswers, taskPrompt, checkTaskAnswer, keyTokens, normalizeAnswer, TASK_LIMITS,
} from './sceneTask.js'
import { validateSceneV2, normalizeSceneV2 } from './sceneSchemaV2.js'
import { lintScene } from './sceneLint.js'
import { sceneLegendText, sceneLegend, TASK_EXAMPLE } from './sceneLegend.js'
import { demoCafeScene } from './demoScenes.js'
import { migrateScene } from './sceneMigrate.js'
import { resolveSceneNode } from './sceneNode.js'

const clone = s => JSON.parse(JSON.stringify(s))

// Сцена с заданием: кот отвечает по-английски, перевод — эталон ответа
function taskScene(task = { kind: 'translate', lineIndex: 1, accept: ['Капучино нормальный, просто чашка маленькая'], hint: 'про чашку' }) {
  const s = clone(demoCafeScene)
  s.timeline = [
    { who: 'a', text: 'Did you order the biggest cappuccino again?', emotion: 'surprised', translation: 'Ты опять заказал самый большой капучино?' },
    { who: 'b', text: "It's not big. It's normal. The cup is just small.", emotion: 'neutral', translation: 'Он не большой. Он нормальный. Просто чашка маленькая.' },
    { who: 'a', text: 'A cup the size of a bucket, actually.', emotion: 'happy', translation: 'Чашка размером с ведро, вообще-то.' },
  ]
  if (task) s.task = task
  return s
}
const line = taskScene().timeline[1]
const task = taskScene().task

describe('normalizeTask / validateTask', () => {
  it('мусор → null; минимальное задание нормализуется с пустыми accept и lineIndex null', () => {
    expect(normalizeTask(null)).toBeNull()
    expect(normalizeTask({ kind: 'quiz' })).toBeNull()
    expect(normalizeTask({ kind: 'translate' })).toEqual({ kind: 'translate', lineIndex: null, accept: [] })
  })
  it('лимиты: prompt/hint режутся, accept — без пустых, повторов и не больше 8', () => {
    const t = normalizeTask({ kind: 'translate', lineIndex: 2, prompt: ' Что? '.padEnd(100, 'х'), accept: ['а', ' а ', '', 3, ...'bcdefghij'], hint: 'п'.repeat(200) })
    expect(t.lineIndex).toBe(2)
    expect(t.prompt.length).toBe(TASK_LIMITS.maxPrompt)
    expect(t.accept.length).toBe(TASK_LIMITS.maxAccept)
    expect(t.accept[0]).toBe('а')
    expect(t.hint.length).toBe(TASK_LIMITS.maxHint)
  })
  it('ошибки с путями по-русски', () => {
    const errs = []
    validateTask({ kind: 'x', lineIndex: 7, prompt: 'п'.repeat(81), accept: ['', 'ок'], hint: 5 }, 3, errs)
    expect(errs.some(e => e.startsWith('task.kind'))).toBe(true)
    expect(errs.some(e => e.startsWith('task.lineIndex') && e.includes('№8'))).toBe(true)
    expect(errs.some(e => e.startsWith('task.prompt'))).toBe(true)
    expect(errs.some(e => e.startsWith('task.accept[0]'))).toBe(true)
    expect(errs.some(e => e.startsWith('task.hint'))).toBe(true)
    const none = []
    validateTask(undefined, 3, none)
    expect(none).toEqual([])
  })
})

describe('схема/нормализация/миграция с полем task', () => {
  it('сцена с заданием валидна; без поля — как раньше; нормализация сохраняет task и не добавляет его пустым', () => {
    expect(validateSceneV2(taskScene())).toEqual([])
    expect(validateSceneV2(demoCafeScene)).toEqual([])
    const n = normalizeSceneV2(taskScene())
    expect(n.task).toEqual({ kind: 'translate', lineIndex: 1, accept: ['Капучино нормальный, просто чашка маленькая'], hint: 'про чашку' })
    expect('task' in normalizeSceneV2(demoCafeScene)).toBe(false)
    expect(normalizeSceneV2(n)).toEqual(n)
  })
  it('нода урока и миграция не ломаются', () => {
    expect(resolveSceneNode({ scene: taskScene() }).scene.task.kind).toBe('translate')
    expect(migrateScene(taskScene())).toEqual(taskScene())
  })
})

describe('taskTargetLine / taskAnswers / taskPrompt', () => {
  it('явный lineIndex; null → последняя с translation; нет переводов → последняя', () => {
    expect(taskTargetLine(taskScene()).index).toBe(1)
    const auto = taskScene({ kind: 'translate', lineIndex: null, accept: [] })
    expect(taskTargetLine(auto).index).toBe(2)
    delete auto.timeline[2].translation
    expect(taskTargetLine(auto).index).toBe(1)
    const none = taskScene({ kind: 'translate' })
    none.timeline.forEach(l => delete l.translation)
    expect(taskTargetLine(none).index).toBe(2)
    expect(taskTargetLine(demoCafeScene)).toBeNull()
  })
  it('эталоны = перевод + accept без повторов; вопрос по умолчанию с именем и родом', () => {
    expect(taskAnswers(task, line)).toEqual(['Он не большой. Он нормальный. Просто чашка маленькая.', 'Капучино нормальный, просто чашка маленькая'])
    expect(taskAnswers({ kind: 'translate', accept: ['x', 'x'] }, {})).toEqual(['x'])
    const s = taskScene()
    expect(taskPrompt(s.task, s, s.timeline[1])).toBe('Что сказал Барсик?')
    expect(taskPrompt(s.task, s, s.timeline[0])).toBe('Что сказала Мурка?')
    expect(taskPrompt({ kind: 'translate', prompt: 'О чём он?' }, s, s.timeline[1])).toBe('О чём он?')
  })
})

describe('checkTaskAnswer — нечёткое сравнение смысла', () => {
  it('нормализация: регистр, ё, знаки, пробелы; стоп-слова отбрасываются', () => {
    expect(normalizeAnswer('  Ёж, ПРИШЁЛ!  ')).toBe('еж пришел')
    expect(keyTokens('Он не большой, просто чашка маленькая')).toEqual(['большой', 'чашка', 'маленькая'])
    expect(keyTokens('я и ты')).toEqual(['я', 'и', 'ты']) // одни стоп-слова — считаются все
  })
  it('точный и перефразированный верные ответы засчитываются', () => {
    expect(checkTaskAnswer(task, line, 'Он не большой. Он нормальный. Просто чашка маленькая.').ok).toBe(true)
    const r = checkTaskAnswer(task, line, 'он нормальный, просто чашка маленькая')
    expect(r.ok).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(0.7)
    // синоним из accept — засчитан по нему
    const a = checkTaskAnswer(task, line, 'капучино нормальный, чашка маленькая')
    expect(a.ok).toBe(true)
    expect(a.matchedAnswer).toBe('Капучино нормальный, просто чашка маленькая')
  })
  it('опечатки и формы слов прощаются по длине слова', () => {
    expect(checkTaskAnswer(task, line, 'он не болшой, нормальый, просто чашка маленькоя').ok).toBe(true)
    expect(checkTaskAnswer(task, line, 'нормальная чашка, маленькая и не большая').ok).toBe(true)
  })
  it('плохие ответы, пустое и мусор — не ок; очень короткий ответ не проходит случайно', () => {
    expect(checkTaskAnswer(task, line, 'Ты опять заказал самый большой капучино').ok).toBe(false)
    const empty = checkTaskAnswer(task, line, '   ')
    expect(empty.ok).toBe(false)
    expect(empty.empty).toBe(true)
    expect(empty.missingKeys.length).toBeGreaterThan(0)
    expect(checkTaskAnswer(task, line, 'asdf qwer zxcv').ok).toBe(false)
    expect(checkTaskAnswer(task, line, 'чашка').ok).toBe(false)
    expect(checkTaskAnswer(task, line, '!!! ...').empty).toBe(true)
  })
  it('эталон из одного слова — одно слово засчитывается; missingKeys подсказывает, чего не хватило', () => {
    expect(checkTaskAnswer({ kind: 'translate', accept: [] }, { translation: 'Договорились.' }, 'договорились!').ok).toBe(true)
    const r = checkTaskAnswer(task, line, 'он нормальный')
    expect(r.ok).toBe(false)
    expect(r.missingKeys).toEqual(expect.arrayContaining(['чашка', 'маленькая']))
  })
  it('без эталонов — не ок', () => {
    expect(checkTaskAnswer({ kind: 'translate', accept: [] }, { text: 'Hi.' }, 'привет').ok).toBe(false)
  })
})

describe('линтер и легенда с заданием', () => {
  const texts = s => lintScene(s).map(i => `${i.level}:${i.text}`)
  it('сцена с заданием и переводом — без ошибок; без перевода и accept — ошибка', () => {
    expect(lintScene(taskScene()).filter(i => i.level === 'error')).toEqual([])
    const s = taskScene({ kind: 'translate', lineIndex: 1, accept: [] })
    delete s.timeline[1].translation
    expect(texts(s).some(t => t.startsWith('error:task — у реплики №2 нет перевода'))).toBe(true)
  })
  it('предупреждения: мало реплик, один эталон, реплика не выбрана, эталон из одного слова', () => {
    const s = taskScene({ kind: 'translate', lineIndex: null, accept: [] })
    s.timeline = s.timeline.slice(0, 2)
    s.timeline[1].translation = 'Нормальный.'
    const t = texts(s)
    expect(t.some(x => x.startsWith('warn:task — диалог короче'))).toBe(true)
    expect(t.some(x => x.startsWith('warn:task.accept — нет синонимичных'))).toBe(true)
    expect(t.some(x => x.startsWith('warn:task.lineIndex — реплика не выбрана'))).toBe(true)
    expect(t.some(x => x.includes('из одного значимого слова'))).toBe(true)
    expect(texts(taskScene()).some(x => x.startsWith('warn:task'))).toBe(false)
  })
  it('легенда описывает task и содержит валидный пример задания; пример валидной сцены остаётся последним', () => {
    const text = sceneLegendText()
    expect(text).toContain('- task:')
    expect(text).toContain('- task.accept:')
    expect(text).toContain('## Пример задания «О чём диалог»')
    const example = text.slice(text.indexOf('## Пример валидной сцены') + '## Пример валидной сцены'.length)
    expect(lintScene(JSON.parse(example))).toEqual([])
    const s = { ...clone(demoCafeScene), ...clone(TASK_EXAMPLE) }
    expect(lintScene(s).filter(i => i.level === 'error')).toEqual([])
    expect(checkTaskAnswer(s.task, s.timeline[1], 'он не большой, просто чашка маленькая').ok).toBe(true)
    expect(sceneLegend().taskExample).toBe(TASK_EXAMPLE)
    expect(sceneLegend().fields['task.lineIndex']).toBeTruthy()
  })
})
