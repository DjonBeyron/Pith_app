import { describe, it, expect, beforeEach } from 'vitest'
import {
  SCENE_PAUSES, PAUSE_DEFAULTS, PAUSES_DEVICE_KEY, pauseMs, listPauses, pauseInfo, validatePauses, setPauseOverrides, getPauseOverrides, pauseLayer, commitPauses, resetPauses,
  readDevicePauses, saveDevicePauses, clearDevicePauses, parsePausesParam, pausesLogLine,
} from './scenePauses.js'

// Реестр пауз сценария (CONCEPT_TIMELINE.md, «Шаг 2»): пределы, слои источников, «мусор не ломает игру»
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
beforeEach(() => { resetPauses(); try { globalThis.localStorage?.removeItem(PAUSES_DEVICE_KEY) } catch { /* нет хранилища */ } })

describe('реестр пауз', () => {
  it('у каждой паузы — уникальный ключ, русские название и «между чем и чем», этап, пределы: min ≤ def ≤ max, min ≥ 0, max конечен, шаг > 0', () => {
    expect(SCENE_PAUSES.length).toBeGreaterThanOrEqual(10)
    expect(new Set(SCENE_PAUSES.map(p => p.key)).size).toBe(SCENE_PAUSES.length)
    for (const p of SCENE_PAUSES) {
      expect(p.title).toMatch(/[а-яё]/i); expect(p.where).toContain('→'); expect(['Старт', 'Конвейер слов', 'Разворот', 'Допрос у Мии', 'Фразы', 'Экзамен', 'Итог']).toContain(p.group)
      expect(p.min).toBeGreaterThanOrEqual(0); expect(p.min).toBeLessThanOrEqual(p.def); expect(p.def).toBeLessThanOrEqual(p.max); expect(Number.isFinite(p.max)).toBe(true); expect(p.max).toBeLessThanOrEqual(5000); expect(p.step).toBeGreaterThan(0)
    }
  })
  it('без переопределений pauseMs — значение по умолчанию; неизвестный ключ — 0; список для экрана несёт действующее значение и источник', () => {
    for (const p of SCENE_PAUSES) expect(pauseMs(p.key)).toBe(p.def)
    expect(pauseMs('нет.такой')).toBe(0); expect(pauseInfo('mia.intro').def).toBe(0); expect(pauseInfo('x')).toBeNull()
    expect(getPauseOverrides()).toEqual({}); expect(pausesLogLine()).toBe('[pauses] все по умолчанию')
    setPauseOverrides({ 'mia.intro': 800 })
    expect(listPauses().find(p => p.key === 'mia.intro')).toMatchObject({ value: 800, source: 'manual', def: 0 })
    expect(listPauses().find(p => p.key === 'mia.gap')).toMatchObject({ value: 350, source: null })
  })
})

describe('проверка значений', () => {
  it('неизвестные ключи, не числа и значения вне пределов отбрасываются с причиной; годное округляется', () => {
    const r = validatePauses({ 'mia.intro': 800.4, 'good.delay': 5, 'mia.gap': 99999, 'нет.такой': 100, 'preSay.gap': '450', 'stage.exit': NaN, 'boss.pit1At': 1000 })
    expect(r.pauses).toEqual({ 'mia.intro': 800 })
    expect(r.dropped.map(d => [d.key, d.why])).toEqual([['good.delay', 'вне пределов 150…2000 мс'], ['mia.gap', 'вне пределов 100…2000 мс'], ['нет.такой', 'нет такой паузы'], ['preSay.gap', 'не число'], ['stage.exit', 'не число'], ['boss.pit1At', 'вне пределов 1650…5000 мс']])
  })
  it('ни одна пауза не уходит в минус и в бесконечность', () => {
    for (const p of SCENE_PAUSES) for (const bad of [-1, -1000, Infinity, -Infinity, p.max + 1]) expect(validatePauses({ [p.key]: bad }).pauses).toEqual({})
  })
  it('настройка целиком { v, pauses, savedAt, by } читается; мусор (null, строка, массив, число) — пусто и без исключений', () => {
    expect(validatePauses({ v: 1, pauses: { 'mia.gap': 500 }, savedAt: 'x', by: 'u' })).toEqual({ pauses: { 'mia.gap': 500 }, dropped: [] })
    expect(validatePauses({ v: 1, savedAt: 'x', 'mia.gap': 500 })).toEqual({ pauses: { 'mia.gap': 500 }, dropped: [] })
    for (const junk of [null, undefined, 'строка', 42, [1, 2], { pauses: 'нет' }, { pauses: [1] }]) expect(validatePauses(junk).pauses).toEqual({})
    for (const junk of ['строка', 42, [1, 2], { lines: {} }]) expect(() => setPauseOverrides(junk)).not.toThrow()
    expect(getPauseOverrides()).toEqual({})
  })
})

describe('слои источников', () => {
  it('сервер кладёт без применения (commit: false): действует только после commitPauses — посреди игры пауза не меняется', () => {
    setPauseOverrides({ pauses: { 'race.announce': 3000 } }, { source: 'server', commit: false })
    expect(pauseMs('race.announce')).toBe(1700); expect(pauseLayer('server')).toEqual({ 'race.announce': 3000 })
    expect(commitPauses({ ls: mem() })).toMatchObject({ pauses: { 'race.announce': 3000 }, from: { 'race.announce': 'server' }, changed: true })
    expect(pauseMs('race.announce')).toBe(3000); expect(commitPauses({ ls: mem() }).changed).toBe(false)
  })
  it('старший источник перекрывает младший по ключу: сервер < это устройство < стенд < вручную; значение «как по умолчанию» снимает переопределение младшего', () => {
    setPauseOverrides({ 'mia.gap': 500, 'good.delay': 700, 'phrase.exit': 900 }, { source: 'server', commit: false })
    const ls = mem({ [PAUSES_DEVICE_KEY]: JSON.stringify({ v: 1, pauses: { 'mia.gap': 600, 'phrase.exit': 300 } }) })
    setPauseOverrides({ 'good.delay': 800 }, { source: 'stand', commit: false })
    expect(commitPauses({ ls })).toMatchObject({ pauses: { 'mia.gap': 600, 'good.delay': 800 }, from: { 'mia.gap': 'device', 'good.delay': 'stand' } })
    expect(pauseMs('phrase.exit')).toBe(300)
    expect(pausesLogLine()).toBe('[pauses] переопределено 2: mia.gap=600 мс (было 350), good.delay=800 мс (было 500); источник: это устройство + стенд')
  })
  it('новый набор источника заменяет прежний; пустой — убирает; resetPauses возвращает умолчания', () => {
    setPauseOverrides({ 'mia.gap': 500, 'good.delay': 700 }); setPauseOverrides({ 'good.delay': 900 })
    expect(getPauseOverrides()).toEqual({ 'good.delay': 900 })
    setPauseOverrides(null); expect(getPauseOverrides()).toEqual({})
    setPauseOverrides({ 'mia.gap': 500 }); resetPauses(); expect(pauseMs('mia.gap')).toBe(PAUSE_DEFAULTS['mia.gap'])
    expect(setPauseOverrides({ 'mia.gap': 500 }, { source: 'device' }).dropped).toHaveLength(1); expect(getPauseOverrides()).toEqual({})
  })
})

describe('это устройство (localStorage) и параметр стенда', () => {
  it('запись и чтение; пустой набор стирает запись; негодное не пишется', () => {
    const ls = mem()
    expect(saveDevicePauses({ 'mia.intro': 1000, 'good.delay': 1 }, ls)).toMatchObject({ ok: true, pauses: { 'mia.intro': 1000 } })
    expect(JSON.parse(ls.getItem(PAUSES_DEVICE_KEY))).toMatchObject({ v: 1, pauses: { 'mia.intro': 1000 } })
    expect(readDevicePauses(ls).pauses).toEqual({ 'mia.intro': 1000 })
    clearDevicePauses(ls); expect(ls.getItem(PAUSES_DEVICE_KEY)).toBeNull(); expect(readDevicePauses(ls)).toBeNull()
  })
  it('мусор в localStorage и хранилище, которое бросает, игру не ломают: значения по умолчанию', () => {
    for (const raw of ['{битый json', '"строка"', '[1,2]', '{"pauses":{"mia.gap":-5,"x":1}}', 'null']) {
      const ls = mem({ [PAUSES_DEVICE_KEY]: raw })
      expect(() => commitPauses({ ls })).not.toThrow(); expect(getPauseOverrides()).toEqual({})
    }
    const broken = { getItem: () => { throw new Error('нет доступа') }, setItem: () => { throw new Error('нет доступа') }, removeItem: () => { throw new Error('нет доступа') } }
    expect(() => commitPauses({ ls: broken })).not.toThrow(); expect(saveDevicePauses({ 'mia.gap': 500 }, broken).ok).toBe(false); expect(pauseMs('mia.gap')).toBe(350)
  })
  it('?pauses= — «ключ=мс,ключ=мс» или JSON; пусто и мусор — {}', () => {
    expect(parsePausesParam('mia.intro=800, race.announce=3000')).toEqual({ 'mia.intro': 800, 'race.announce': 3000 })
    expect(parsePausesParam('{"mia.gap":500}')).toEqual({ 'mia.gap': 500 }); expect(parsePausesParam('{"pauses":{"mia.gap":500}}')).toEqual({ 'mia.gap': 500 })
    expect(parsePausesParam('')).toEqual({}); expect(parsePausesParam(null)).toEqual({}); expect(parsePausesParam('{битый')).toEqual({})
    expect(setPauseOverrides(parsePausesParam('mia.gap=abc,good.delay=600'), { source: 'stand' }).pauses).toEqual({ 'good.delay': 600 })
  })
})
