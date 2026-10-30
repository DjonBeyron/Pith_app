import { describe, it, expect } from 'vitest'
import { noteFor, fasterBy, slowerBy, FAIL_NOTE, CLEAN_TEXTS } from './mirrorNotes.js'
import { rngFor } from '../rehearsalSeed.js'
import { measureTake } from './mirrorMeasure.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING, STUDENT_PAUSE } from './mirrorFixtures.js'

const base = { tempo: 1, missing: [], extra: [], orderOk: true, order: null, pauses: [], loud: 1, clean: true }
const note = patch => noteFor({ ...base, ...patch }, CHUNKS)

describe('noteFor: одна заметка, приоритет missing > порядок > темп > пауза > громкость > чисто', () => {
  it('потеряно слово', () => {
    expect(note({ missing: ['trying'], clean: false })).toEqual({ key: 'missing', text: '„trying“ потерялось.' })
    expect(note({ missing: ['trying', 'to learn'] }).text).toBe('„trying“ и „to learn“ потерялись.')
    expect(note({ missing: CHUNKS }).key).toBe('missing') // потеряно всё — отдельная формулировка
  })
  it('порядок', () => {
    expect(note({ orderOk: false, order: { early: 'to learn', late: 'trying' } })).toEqual({ key: 'order', text: '„to learn“ прозвучало раньше „trying“.' })
    expect(note({ orderOk: false }).key).toBe('order')
  })
  it('темп: быстрее/медленнее на ≥ 25 %, формулировка по числу', () => {
    expect(note({ tempo: 0.67 }).text).toBe('Ты быстрее меня на треть — это нормально, но дай словам чуть больше места.')
    expect(note({ tempo: 0.75 }).text).toContain('быстрее меня на четверть')
    expect(note({ tempo: 0.5 }).text).toContain('быстрее меня вдвое')
    expect(note({ tempo: 0.6 }).text).toContain('быстрее меня на 40 %')
    expect(note({ tempo: 1.25 }).text).toContain('медленнее меня на четверть')
    expect(note({ tempo: 1.88 }).text).toContain('медленнее меня на 88 %')
    expect(note({ tempo: 2 }).text).toContain('медленнее меня вдвое')
    expect(note({ tempo: 0.8 }).key).toBe('clean')
    expect(note({ tempo: 1.2 }).key).toBe('clean')
  })
  it('пауза: самая длинная относительно диктора; короче 400 мс не в счёт', () => {
    const pauses = [{ before: 'trying', studentMs: 600, dictorMs: 100 }, { before: 'to learn', studentMs: 1100, dictorMs: 80 }]
    expect(note({ pauses })).toEqual({ key: 'pause', text: 'Пауза перед „to learn“ длиннее, чем у меня. Склей.' })
    expect(note({ pauses: [{ before: 'trying', studentMs: 450, dictorMs: 100 }] }).key).toBe('clean')
  })
  it('громкость: тише на ≥ 40 %', () => {
    expect(note({ loud: 0.6 })).toEqual({ key: 'loud', text: 'Тише, чем нужно для сцены.' })
    expect(note({ loud: 0.7 }).key).toBe('clean')
    expect(note({ loud: null }).key).toBe('clean')
  })
  it('лишнее слово — после громкости, перед «чисто»', () => {
    expect(note({ extra: ['okay'], clean: false }).text).toBe('Лишнее слово „okay“ — в сцене его нет.')
    expect(note({ extra: ['a', 'b'] }).text).toBe('Лишние слова „a“, „b“ — в сцене их нет.')
  })
  it('чисто', () => {
    expect(note({})).toEqual({ key: 'clean', text: 'Порядок верный, темп мой. Чисто.' })
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
    expect(FAIL_NOTE.text).toBe('Запись не получилась — попробуем в следующий раз.')
  })
  it('формулировки доли: четверть / треть / вдвое / N %', () => {
    expect(fasterBy(0.25)).toBe('на четверть')
    expect(fasterBy(0.33)).toBe('на треть')
    expect(fasterBy(0.5)).toBe('вдвое')
    expect(fasterBy(0.7)).toBe('на 70 %')
    expect(slowerBy(0.5)).toBe('в полтора раза')
    expect(slowerBy(0.33)).toBe('на треть')
  })
  it('сквозной прогон: измерение → заметка на трёх готовых дублях', () => {
    const run = student => noteFor(measureTake({ dictor: DICTOR, student, chunks: CHUNKS }), CHUNKS)
    expect(run(STUDENT_CLEAN).key).toBe('clean')
    expect(run(STUDENT_MISSING).text).toBe('„trying“ потерялось.')
    expect(run(STUDENT_PAUSE).text).toBe('Пауза перед „to learn“ длиннее, чем у меня. Склей.')
  })
})

describe('заметка «чисто»: две формулировки одного смысла (CONCEPT_REHEARSAL.md §8)', () => {
  it('без rng — первая (прежний текст), с rng — одна из двух по семени; остальные заметки не меняются', () => {
    expect(CLEAN_TEXTS).toHaveLength(2); expect(CLEAN_TEXTS[0]).toBe('Порядок верный, темп мой. Чисто.')
    expect(noteFor(base, CHUNKS).text).toBe(CLEAN_TEXTS[0])
    const got = new Set(Array.from({ length: 40 }, (_, i) => noteFor(base, CHUNKS, rngFor(`s${i}`, 'mirror')).text))
    expect(got).toEqual(new Set(CLEAN_TEXTS))
    expect(noteFor(base, CHUNKS, rngFor('s', 'mirror'))).toEqual(noteFor(base, CHUNKS, rngFor('s', 'mirror'))) // одно семя — одна заметка
    expect(noteFor({ ...base, missing: ['trying'] }, CHUNKS, rngFor('q')).text).toBe('„trying“ потерялось.')
    expect(noteFor({ ...base, tempo: 0.5 }, CHUNKS, rngFor('q')).key).toBe('tempo'); expect(noteFor(null, CHUNKS, rngFor('q'))).toEqual(FAIL_NOTE)
    expect(noteFor(base, CHUNKS, rngFor('s', 'mirror')).key).toBe('clean')
  })
})
