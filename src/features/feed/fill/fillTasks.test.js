import { describe, it, expect } from 'vitest'
import { tokensOf, cardLines, findWord, audioFor, pickFillTask, openFill } from './fillTasks.js'

// Голосовое: тайминги [{ w, t, e }]; сцена: реплики timeline с [{ word, start, end }]
const voice = (id, text, timings, r2Url = 'https://r2.dev/a.mp3') => ({ id, type: 'audio', typeData: { audio: { text, r2Url, wordTimings: timings } } })
const sceneNode = lines => ({ id: 'sc', type: 'scene', typeData: { scene: { scene: { timeline: lines } } } })
const deck = (nodes, id = 'm1') => ({ phrase: 'p', modules: [{ id, title: 'p' }], cards: [{ id: 'k', nodes, lessonId: 'l', teacher: {} }] })
const first = () => 0

const sheepTimings = [{ w: 'I', t: 0.1, e: 0.2 }, { w: 'see', t: 0.3, e: 0.6 }, { w: 'a', t: 0.7, e: 0.8 }, { w: 'sheep.', t: 0.9, e: 1.5 }]
// слова-двойники живут в других колодах (без реплик — сами в игру не годятся)
const others = new Map([
  ['ship', deck([])], ['chip', deck([])], ['table', deck([])],
])

describe('tokensOf / findWord', () => {
  it('слова с позициями; апострофы и дефисы — часть слова', () => {
    expect(tokensOf("It's a well-known (sheep).").map(t => t.norm)).toEqual(["it's", 'a', 'well-known', 'sheep'])
    expect(tokensOf('Привет, 123').length).toBe(0)
  })

  it('слово в реплике: номер вхождения; слишком короткая и слишком длинная реплика — не годится', () => {
    const line = { text: 'I see a sheep and a sheep', timings: [] }
    expect(findWord(line, 'sheep').k).toBe(0)
    expect(findWord({ text: 'Sheep!', timings: [] }, 'sheep')).toBeNull() // одно слово — не реплика
    expect(findWord({ text: 'a sheep', timings: [] }, 'sheep')).toBeNull()
    expect(findWord({ text: Array(25).fill('word').join(' ') + ' sheep', timings: [] }, 'sheep')).toBeNull()
    expect(findWord(line, 'goat')).toBeNull()
  })
})

describe('cardLines: реплики карточки', () => {
  it('голосовое и сцена приводятся к одному виду; шаблоны сцен пропускаются', () => {
    const lines = cardLines({ nodes: [
      voice('v', 'I see a sheep.', sheepTimings),
      sceneNode([
        { text: 'A sheep is here', audioUrl: 'https://r2.dev/s.mp3', wordTimings: [{ word: 'A', start: 0, end: 0.2 }, { word: 'sheep', start: 0.3, end: 0.8 }] },
        { text: 'Mine is {word}', segments: [{ text: 'x' }] },
        { text: '', audioUrl: 'https://r2.dev/e.mp3' },
      ]),
      { id: 't', type: 'text', typeData: { text: { text: 'Teacher says sheep here' } } }, // текст учителя — не реплика
    ] })
    expect(lines).toHaveLength(2)
    expect(lines[0].timings[3]).toEqual({ word: 'sheep', start: 0.9, end: 1.5, nextStart: null })
    expect(lines[1].timings[1]).toEqual({ word: 'sheep', start: 0.3, end: 0.8, nextStart: null })
    expect(lines[0].timings[0].nextStart).toBe(0.3)
  })
})

describe('audioFor: расписание звука для слова', () => {
  const line = { text: 'I see a sheep.', audioUrl: 'https://r2.dev/a.mp3', timings: cardLines({ nodes: [voice('v', 'I see a sheep.', sheepTimings)] })[0].timings }

  it('есть файл и тайминг слова — шаги «до → мяу → после»', () => {
    const a = audioFor(line, 'sheep', 0)
    expect(a.url).toBe('https://r2.dev/a.mp3')
    expect(a.steps.map(s => s.stage)).toEqual(['before', 'meow', 'after'])
  })

  it('нет адреса, не https, нет тайминга слова или нужного вхождения — звука нет, реплика текстом', () => {
    expect(audioFor({ ...line, audioUrl: null }, 'sheep', 0)).toBeNull()
    expect(audioFor({ ...line, audioUrl: 'blob:x' }, 'sheep', 0)).toBeNull()
    expect(audioFor({ ...line, timings: [] }, 'sheep', 0)).toBeNull()
    expect(audioFor(line, 'sheep', 1)).toBeNull()
  })
})

describe('pickFillTask', () => {
  const decks = new Map([['sheep', deck([voice('v', 'I see a sheep.', sheepTimings)])], ...others])

  it('задача: текст вокруг слова, три слова на выбор (верное + два двойника), звук', () => {
    const r = pickFillTask(decks, { rand: first })
    expect(r.word).toBe('sheep')
    expect(r.moduleId).toBe('m1')
    expect(r.task.before).toBe('I see a ')
    expect(r.task.after).toBe('.')
    expect(r.task.answer).toBe('sheep')
    expect(r.task.options).toHaveLength(3)
    expect(r.task.options).toContain('sheep')
    expect(new Set(r.task.options).size).toBe(3)
    expect(r.task.options).toContain('ship')
    expect(r.task.audio.steps.map(s => s.stage)).toEqual(['before', 'meow', 'after'])
  })

  it('регистр слова в реплике переносится на варианты', () => {
    const d = new Map([['sheep', deck([voice('v', 'Sheep are nice animals', [])])], ...others])
    const r = pickFillTask(d, { rand: first })
    expect(r.task.options.every(o => o[0] === o[0].toUpperCase())).toBe(true)
    expect(r.task.audio).toBeNull() // таймингов нет — реплика только текстом
  })

  it('нет двойников (меньше двух похожих) — задачи нет', () => {
    const d = new Map([['sheep', deck([voice('v', 'I see a sheep.', sheepTimings)])], ['table', deck([])]])
    expect(pickFillTask(d, { rand: first })).toBeNull()
  })

  it('уже предложенные слова пропускаются; слова не из памяти — раньше', () => {
    expect(pickFillTask(decks, { exclude: ['sheep'], rand: first })).toBeNull()
    const two = new Map([...decks, ['ship', deck([voice('w', 'The ship is big today', [{ w: 'ship', t: 0.5 }])])]])
    expect(pickFillTask(two, { inMemory: new Set(['sheep']), rand: first }).word).toBe('ship')
  })

  it('звук включён — реплика со звуком в приоритете; нет звучащей — берётся текстовая', () => {
    const lines = [voice('a', 'I see a sheep.', sheepTimings), voice('b', 'The sheep is white', [])]
    const d = new Map([['sheep', deck(lines)], ...others])
    expect(pickFillTask(d, { sound: true, rand: first }).task.text).toBe('I see a sheep.')
    const mute = new Map([['sheep', deck([voice('b', 'The sheep is white', [])])], ...others])
    expect(pickFillTask(mute, { sound: true, rand: first }).task.audio).toBeNull()
  })

  it('слова-фразы и слишком короткие в игру не идут; пустые колоды — null', () => {
    const d = new Map([['give up', deck([voice('v', 'I give up now', [])])], ['go', deck([voice('w', 'We go home now', [])])], ...others])
    expect(pickFillTask(d, { rand: first })).toBeNull()
    expect(pickFillTask(new Map(), {})).toBeNull()
    expect(pickFillTask(null, {})).toBeNull()
  })
})

describe('openFill: звук проверяется в момент показа', () => {
  const pick = pickFillTask(new Map([['sheep', deck([voice('v', 'I see a sheep.', sheepTimings)])], ...others]), { rand: first })
  it('звук есть — склейка остаётся; звука нет — только текст', () => {
    expect(openFill(pick, { sound: true }).task.audio).not.toBeNull()
    expect(openFill(pick, { sound: false }).task.audio).toBeNull()
    expect(openFill(pick, { sound: false }).task.before).toBe('I see a ')
    expect(pick.task.audio).not.toBeNull() // исходная задача не тронута
  })
})
