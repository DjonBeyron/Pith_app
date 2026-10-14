import { describe, it, expect } from 'vitest'
import { validateSceneV2, normalizeSceneV2, migrateScene, parseSceneV2, LIMITS } from './sceneSchemaV2.js'
import { demoOfficeScene, demoCafeScene } from './demoScenes.js'
import { slotsFor } from './sprites/slots.js'

const clone = s => JSON.parse(JSON.stringify(s))

// Сценарий стенда (version 1) — для миграции
const v1 = {
  version: 1,
  background: 'kitchen',
  characters: [
    { id: 'ryzhik', name: 'Рыжик', colors: { body: '#f2a65a', belly: '#fde7c8', ear: '#f6a9a3', eye: '#5aa36b', stripe: '#d9843d' }, voice: { pitch: 0.8, rate: 1 } },
    { id: 'dymka', name: 'Дымка', colors: { body: '#8e97a8', ear: '#f1b7c4', eye: '#e2b14c' }, voice: { pitch: 1.3, rate: 1.05 } },
  ],
  timeline: [
    { who: 'ryzhik', text: 'Привет!', emotion: 'happy' },
    { who: 'dymka', text: 'Привет.', emotion: 'tired', pose: 'lean' },
  ],
}

describe('validateSceneV2', () => {
  it('демо-сцены валидны', () => {
    expect(validateSceneV2(demoOfficeScene)).toEqual([])
    expect(validateSceneV2(demoCafeScene)).toEqual([])
  })

  it('не объект / не та версия', () => {
    expect(validateSceneV2(null)).toEqual(['Сцена должна быть объектом'])
    expect(validateSceneV2({ ...clone(demoOfficeScene), version: 1 })[0]).toMatch(/version/)
  })

  it('ровно два персонажа a и b, пол обязателен', () => {
    const s = clone(demoOfficeScene)
    s.characters.c = { gender: 'male', name: 'Лишний' }
    delete s.characters.b.gender
    const errs = validateSceneV2(s)
    expect(errs.some(e => e.startsWith('characters.c'))).toBe(true)
    expect(errs.some(e => e.startsWith('characters.b.gender'))).toBe(true)
  })

  it('палитра — только #rrggbb и известные ключи', () => {
    const s = clone(demoOfficeScene)
    s.characters.a.palette = { fur: 'red', hat: '#000000' }
    const errs = validateSceneV2(s)
    expect(errs).toContain('characters.a.palette.fur — цвет вида #rrggbb')
    expect(errs.some(e => e.includes('palette.hat'))).toBe(true)
  })

  it('слоты: неизвестный слот, неизвестный предмет, несовместимый предмет', () => {
    const s = clone(demoOfficeScene)
    s.slots.roof = 'plant'
    s.slots.window = 'dragon'
    s.slots['desk-left'] = 'whiteboard'
    const errs = validateSceneV2(s)
    expect(errs.some(e => e.startsWith('slots.roof'))).toBe(true)
    expect(errs.some(e => e.includes("неизвестный предмет 'dragon'"))).toBe(true)
    expect(errs.some(e => e.startsWith('slots.desk-left') && e.includes('не ставится'))).toBe(true)
  })

  it('лимиты реплик: минимум 2, максимум 12, длина ≤ 140', () => {
    const one = { ...clone(demoOfficeScene), timeline: [{ who: 'a', text: 'Одна.' }] }
    expect(validateSceneV2(one).some(e => e.includes(`минимум ${LIMITS.minLines}`))).toBe(true)
    const many = { ...clone(demoOfficeScene), timeline: Array.from({ length: 13 }, (_, i) => ({ who: i % 2 ? 'b' : 'a', text: 'Ок.' })) }
    expect(validateSceneV2(many).some(e => e.includes(`максимум ${LIMITS.maxLines}`))).toBe(true)
    const long = clone(demoOfficeScene)
    long.timeline[0].text = 'а'.repeat(141)
    expect(validateSceneV2(long).some(e => e.startsWith('timeline[0].text') && e.includes('140'))).toBe(true)
  })

  it('who/emotion/pose/wordTimings проверяются с путём', () => {
    const s = clone(demoOfficeScene)
    s.timeline[1] = { who: 'c', text: 'Эй.', emotion: 'angry', pose: 'fly', audioUrl: 'https://x/a.mp3', wordTimings: [{ start: 1, end: 0.5 }] }
    const errs = validateSceneV2(s)
    expect(errs).toContain("timeline[1].who — 'a' или 'b'")
    expect(errs.some(e => e.startsWith('timeline[1].emotion'))).toBe(true)
    expect(errs.some(e => e.startsWith('timeline[1].pose'))).toBe(true)
    expect(errs.some(e => e.startsWith('timeline[1].wordTimings[0]'))).toBe(true)
  })
})

describe('normalizeSceneV2', () => {
  it('дефолты: палитры, голос, эмоция/поза, пустые слоты локации, options', () => {
    const n = normalizeSceneV2({ version: 2, location: 'cafe', characters: { a: { name: 'А' } }, timeline: [{ who: 'a', text: ' Да. ' }, { who: 'b', text: 'Нет.' }] })
    expect(n.characters.a.gender).toBe('male')
    expect(n.characters.b.gender).toBe('female')
    expect(n.characters.a.palette.fur).toMatch(/^#/)
    expect(n.characters.b.voice).toEqual({ pitch: 1, rate: 1 })
    expect(n.timeline[0]).toEqual({ who: 'a', text: 'Да.', emotion: 'neutral', pose: 'talk' })
    expect(Object.keys(n.slots).sort()).toEqual(slotsFor('cafe').map(s => s.id).sort())
    expect(Object.values(n.slots).every(v => v === null)).toBe(true)
    expect(n.options).toEqual({ bubbles: true, autoplay: false, loop: false })
  })

  it('неизвестные слоты отбрасываются, известные сохраняются', () => {
    const n = normalizeSceneV2({ version: 2, location: 'office', slots: { window: 'window', roof: 'plant' }, timeline: [] })
    expect(n.slots.window).toBe('window')
    expect('roof' in n.slots).toBe(false)
  })

  it('нормализация демо-сцены валидна и идемпотентна (добавляет только pose по умолчанию)', () => {
    const n = normalizeSceneV2(demoOfficeScene)
    expect(validateSceneV2(n)).toEqual([])
    expect(normalizeSceneV2(n)).toEqual(n)
    expect(n.timeline.map(l => l.pose)).toEqual(['talk', 'talk', 'talk', 'talk', 'lean', 'talk'])
    expect({ ...n, timeline: null }).toEqual({ ...demoOfficeScene, timeline: null })
  })
})

describe('migrateScene (v1 → v2)', () => {
  it('переносит персонажей, цвета, голос, реплики; kitchen → cafe; слоты по умолчанию', () => {
    const m = migrateScene(v1, { id: 'from-stand' })
    expect(m.version).toBe(2)
    expect(m.location).toBe('cafe')
    expect(m.characters.a.name).toBe('Рыжик')
    expect(m.characters.a.gender).toBe('male')
    expect(m.characters.b.gender).toBe('female') // pitch 1.3 → женский
    expect(m.characters.a.palette.fur).toBe('#f2a65a')
    expect(m.characters.b.palette.accent).toBe('#f1b7c4')
    expect(m.characters.b.palette.belly).toMatch(/^#/) // недостающее — из пресета
    expect(m.timeline).toEqual([
      { who: 'a', text: 'Привет!', emotion: 'happy', pose: 'talk' },
      { who: 'b', text: 'Привет.', emotion: 'tired', pose: 'lean' },
    ])
    expect(m.slots.table).toBe('table')
    expect(m.slots.counter).toBe('coffee-machine')
    expect(validateSceneV2(m)).toEqual([])
  })

  it('v2 возвращается как есть, мусор — null', () => {
    expect(migrateScene(demoCafeScene)).toBe(demoCafeScene)
    expect(migrateScene({ version: 3 })).toBeNull()
    expect(migrateScene('нет')).toBeNull()
  })
})

describe('parseSceneV2', () => {
  it('битый JSON — одна ошибка; валидный — нормализованная сцена', () => {
    expect(parseSceneV2('{').errors[0]).toMatch(/JSON не разобран/)
    const r = parseSceneV2(JSON.stringify(demoCafeScene))
    expect(r.errors).toEqual([])
    expect(r.scene.title).toBe('Кофе-брейк')
  })
})
