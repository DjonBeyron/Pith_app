import { describe, it, expect } from 'vitest'
import { noteFor, FAIL_NOTE, CLEAN_TEXT } from './mirrorNotes.js'
import { measureTake } from './mirrorMeasure.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING, STUDENT_PAUSE } from './mirrorFixtures.js'

const base = { tempo: 1, missing: [], extra: [], orderOk: true, order: null, pauses: [], loud: 1, clean: true }
const note = patch => noteFor({ ...base, ...patch }, CHUNKS)

// Текст плашки между горизонтальными пилюлями — конкретика (v3.3.87, п. 13 владельца); общий вердикт говорит Пит (noteLine.js, rh_note_*)
describe('noteFor: одна заметка, приоритет missing > порядок > темп > пауза > громкость > лишнее > чисто', () => {
  it('потеряно слово: одно, несколько, почти всё (kind уточняет реплику Пита)', () => {
    expect(note({ missing: ['trying'], clean: false })).toEqual({ key: 'missing', kind: 'one', text: '„trying“ потерялось' })
    expect(note({ missing: ['trying', 'to learn'] })).toEqual({ key: 'missing', kind: 'few', text: '„trying“ и „to learn“ потерялись' })
    expect(note({ missing: CHUNKS })).toEqual({ key: 'missing', kind: 'all', text: 'Тебя я почти не расслышал, скажи чуть громче' }) // потеряно всё
  })
  it('порядок', () => {
    expect(note({ orderOk: false, order: { early: 'to learn', late: 'trying' } })).toEqual({ key: 'order', text: '„to learn“ прозвучало раньше „trying“' })
    expect(note({ orderOk: false }).key).toBe('order')
  })
  it('темп: быстрее / медленнее на ≥ 25 % — короткие подписи без чисел', () => {
    expect(note({ tempo: 0.67 })).toEqual({ key: 'tempo', kind: 'fast', text: 'не торопись в произношении' })
    expect(note({ tempo: 0.5 }).kind).toBe('fast')
    expect(note({ tempo: 1.25 })).toEqual({ key: 'tempo', kind: 'slow', text: 'лучше не медлить' })
    expect(note({ tempo: 2 }).kind).toBe('slow')
    expect(note({ tempo: 0.8 }).key).toBe('clean')
    expect(note({ tempo: 1.2 }).key).toBe('clean')
  })
  it('пауза: самая длинная относительно диктора; короче 400 мс не в счёт', () => {
    const pauses = [{ before: 'trying', studentMs: 600, dictorMs: 100 }, { before: 'to learn', studentMs: 1100, dictorMs: 80 }]
    expect(note({ pauses })).toEqual({ key: 'pause', text: 'пауза перед „to learn“' })
    expect(note({ pauses: [{ before: 'trying', studentMs: 450, dictorMs: 100 }] }).key).toBe('clean')
  })
  it('громкость: тише на ≥ 40 %', () => {
    expect(note({ loud: 0.6 })).toEqual({ key: 'loud', text: 'в следующий раз говори громче, чтобы я тебя понял' })
    expect(note({ loud: 0.7 }).key).toBe('clean')
    expect(note({ loud: null }).key).toBe('clean')
  })
  it('лишнее слово — после громкости, перед «чисто»; не больше трёх', () => {
    expect(note({ extra: ['okay'], clean: false })).toEqual({ key: 'extra', text: 'лишнее: „okay“' })
    expect(note({ extra: ['a', 'b', 'c', 'd'] }).text).toBe('лишнее: „a“, „b“, „c“')
  })
  it('чисто: одна формулировка — «Идеальное произношение!» (золотая плашка), вариантов нет', () => {
    expect(note({})).toEqual({ key: 'clean', text: 'Идеальное произношение!' })
    expect(CLEAN_TEXT).toBe('Идеальное произношение!')
  })
  it('приоритет при нескольких проблемах сразу', () => {
    const all = { missing: ['trying'], orderOk: false, tempo: 0.5, pauses: [{ before: 'x', studentMs: 900, dictorMs: 80 }], loud: 0.3, extra: ['x'] }
    expect(note(all).key).toBe('missing')
    expect(note({ ...all, missing: [] }).key).toBe('order')
    expect(note({ ...all, missing: [], orderOk: true }).key).toBe('tempo')
    expect(note({ ...all, missing: [], orderOk: true, tempo: 1 }).key).toBe('pause')
    expect(note({ ...all, missing: [], orderOk: true, tempo: 1, pauses: [] }).key).toBe('loud')
    expect(note({ ...all, missing: [], orderOk: true, tempo: 1, pauses: [], loud: 1 }).key).toBe('extra')
  })
  it('нет измерения (запись не получилась) — заметка о сбое', () => {
    expect(noteFor(null, CHUNKS)).toBe(FAIL_NOTE)
    expect(FAIL_NOTE).toEqual({ key: 'fail', text: 'Запись не получилась, попробуем в другой раз' })
  })
  it('сквозной прогон: измерение → заметка на трёх готовых дублях', () => {
    const run = student => noteFor(measureTake({ dictor: DICTOR, student, chunks: CHUNKS }), CHUNKS)
    expect(run(STUDENT_CLEAN).key).toBe('clean')
    expect(run(STUDENT_MISSING).text).toBe('„trying“ потерялось')
    expect(run(STUDENT_PAUSE).text).toBe('пауза перед „to learn“')
  })
})
