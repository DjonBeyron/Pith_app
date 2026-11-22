import { describe, it, expect } from 'vitest'
import { createSceneTrace, parseSceneLines, splitRuns, SCENE_TEXT_MAX } from './sceneTrace.js'
import { createGameJournal } from './gameJournal.js'

const make = (o = {}) => { let t = 100; const lines = []; const tr = createSceneTrace({ now: () => t, log: s => lines.push(s), clock: () => 1, ...o }); return { tr, lines, tick: ms => { t += ms } } }

describe('трасса сцены (sceneTrace)', () => {
  it('push: событие { t, k, …поля } в массиве и строкой «[scene] {json}» в журнале', () => {
    const { tr, lines, tick } = make()
    tr.begin({ game: 'race', seed: 'r1' }); tick(250.04)
    const ev = tr.push('stage-in', { idx: 0, sid: 'sprint-ann' })
    expect(ev).toEqual({ t: 350, k: 'stage-in', idx: 0, sid: 'sprint-ann' })
    expect(tr.events().map(e => e.k)).toEqual(['run', 'stage-in'])
    expect(lines[1]).toBe('[scene] {"t":350,"k":"stage-in","idx":0,"sid":"sprint-ann"}')
  })

  it('push никогда не бросает: журнал упал, данные не сериализуются — игра не замечает', () => {
    const tr = createSceneTrace({ log: () => { throw new Error('журнал сломан') } })
    expect(() => tr.push('note', { a: 1 })).not.toThrow()
    const loop = {}; loop.self = loop
    expect(() => tr.push('note', loop)).not.toThrow()
    expect(() => tr.begin({ x: loop })).not.toThrow()
    expect(tr.push('x', loop)).toBeNull()
    expect(() => { tr.speak(null); tr.end(null); tr.hint(null, null) }).not.toThrow()
  })

  it('потолок: старые события вытесняются пачкой, счётчик вытесненных растёт', () => {
    const { tr } = make({ max: 10, evict: 4 })
    tr.begin({})
    for (let i = 0; i < 20; i++) tr.push('note', { i })
    const run = tr.runs()[0]
    expect(run.events.length).toBeLessThanOrEqual(10)
    expect(run.dropped).toBeGreaterThan(0)
    expect(run.events.length + run.dropped).toBe(21)
    expect(run.events.at(-1).i).toBe(19)
  })

  it('begin: новое прохождение — новый run, хранятся последние три; повторный begin без событий — то же прохождение', () => {
    const { tr } = make()
    const a = tr.begin({ seed: 'a' }); expect(tr.begin({ seed: 'a2' })).toBe(a) // StrictMode / повтор эффекта
    expect(tr.runs()).toHaveLength(1); expect(tr.runs()[0].meta.seed).toBe('a2')
    tr.push('stage-in', {})
    for (const s of ['b', 'c', 'd']) { tr.begin({ seed: s }); tr.push('stage-in', {}) }
    expect(tr.runs().map(r => r.meta.seed)).toEqual(['b', 'c', 'd'])
    expect(tr.events()).toBe(tr.runs()[2].events)
  })

  it('событие без begin открывает прохождение само (auto), следующий begin начинает новое', () => {
    const { tr } = make()
    tr.push('line-start', { who: 'pit', id: 'x' })
    expect(tr.runs()[0].meta.auto).toBe(true)
    tr.begin({ game: 'race' })
    expect(tr.runs()).toHaveLength(2)
  })

  it('speak / end: реплика каталога (текст положил hint) — who pit с текстом; без hint — диктор (слово голосом Пита)', () => {
    const { tr } = make()
    tr.begin({}); tr.hint('race_good_2', 'звучит очень хорошо')
    expect(tr.speak({ id: 'race_good_2', ms: 1500 })).toMatchObject({ k: 'line-start', who: 'pit', id: 'race_good_2', text: 'звучит очень хорошо', ms: 1500 })
    expect(tr.end({ id: 'race_good_2', played: 1490, why: 'done' })).toMatchObject({ k: 'line-end', id: 'race_good_2', played: 1490, why: 'done' })
    expect(tr.speak({ id: 'встречать', ms: 600 })).toMatchObject({ who: 'dictor', id: 'встречать', text: 'встречать' })
    tr.hint('long', 'я'.repeat(500)); expect(tr.speak({ id: 'long' }).text.length).toBe(SCENE_TEXT_MAX + 1)
    tr.begin({}); expect(tr.speak({ id: 'race_good_2' }).who).toBe('dictor') // новое прохождение — подсказки текста сброшены
    tr.push('line-start', { who: 'mia', id: 'mia_push', text: 'Иди сюда' }) // рот Мии сообщает то же cat-speak — второй реплики (диктора) из него не выходит
    expect(tr.speak({ id: 'mia_push', ms: 900 })).toBeNull(); expect(tr.end({ id: 'mia_push' })).toBeNull(); expect(tr.events().filter(e => e.k.startsWith('line-'))).toHaveLength(2)
  })

  it('туда-обратно: события → журнал игры → parseSceneLines → те же события; splitRuns режет по run', () => {
    const j = createGameJournal({ now: () => 5, clock: () => new Date(2026, 10, 22, 10, 0, 0) })
    const { tr } = make({ log: s => j.add(s) })
    tr.begin({ game: 'race', seed: 'r1' }); tr.push('line-start', { who: 'pit', id: 'race_start', text: 'Привет, «мир» {x}' }); tr.push('answer', { res: 'win', idx: 2 })
    tr.begin({ game: 'race', seed: 'r2' }); tr.push('stage-in', { sid: 'a' })
    j.add('[race] посторонняя строка'); j.add('[scene] {битая строка')
    const all = tr.runs().flatMap(r => r.events)
    expect(parseSceneLines(j.text(['шапка']))).toEqual(all)
    expect(parseSceneLines(j.lines())).toEqual(all)
    const runs = splitRuns(parseSceneLines(j.text()))
    expect(runs.map(r => r.meta)).toEqual([{ game: 'race', seed: 'r1' }, { game: 'race', seed: 'r2' }])
    expect(runs[0].events).toEqual(tr.runs()[0].events)
    expect(splitRuns([{ t: 1, k: 'note' }])[0].meta).toEqual({ auto: true })
  })
})

describe('подписка «прохождение закончилось» (onEnd)', () => {
  it('подписчик зовётся на событии end с прохождением; отписка работает; на других событиях — нет', () => {
    const { tr } = make(), got = []
    const off = tr.onEnd(run => got.push([run.id, run.events.at(-1).k, run.events.length]))
    tr.begin({ game: 'race' }); tr.push('stage-in', { sid: 'a' }); expect(got).toEqual([])
    tr.push('end', {}); expect(got).toEqual([[1, 'end', 3]])
    off(); tr.push('end', {}); expect(got).toHaveLength(1)
  })

  it('ошибка подписчика не ломает запись: push возвращает событие, остальные подписчики получают конец', () => {
    const { tr } = make(), got = []
    tr.onEnd(() => { throw new Error('подписчик упал') }); tr.onEnd(run => got.push(run.id))
    tr.begin({})
    expect(tr.push('end', {})).toMatchObject({ k: 'end' }); expect(got).toEqual([1]); expect(tr.events().at(-1).k).toBe('end')
  })
})
