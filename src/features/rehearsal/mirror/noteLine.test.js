import { describe, it, expect } from 'vitest'
import { noteLine, NOTE_LINES } from './noteLine.js'
import { noteFor, FAIL_NOTE } from './mirrorNotes.js'
import { REHEARSAL_LINES } from '../rehearsalLines.js'
import { ACT_LINES } from '../polish/polishLines.js'
import { CHUNKS } from './mirrorFixtures.js'

const base = { tempo: 1, missing: [], extra: [], orderOk: true, order: null, pauses: [], loud: 1, clean: true }
const line = patch => noteLine(noteFor({ ...base, ...patch }, CHUNKS))
const TEXT = Object.fromEntries(REHEARSAL_LINES.map(l => [l.id, l.text]))

describe('noteLine: заметка зеркала → реплика Пита (rh_note_*)', () => {
  it('каждая заметка ведёт в свою реплику', () => {
    expect(noteLine(FAIL_NOTE)).toBe('rh_note_fail')
    expect(line({ missing: ['trying'] })).toBe('rh_note_missing_one')
    expect(line({ missing: ['trying', 'to learn'] })).toBe('rh_note_missing_few')
    expect(line({ missing: CHUNKS })).toBe('rh_note_missing_all')
    expect(line({ orderOk: false, order: { early: 'a', late: 'b' } })).toBe('rh_note_order')
    expect(line({ tempo: 0.5 })).toBe('rh_note_fast')
    expect(line({ tempo: 2 })).toBe('rh_note_slow')
    expect(line({ pauses: [{ before: 'trying', studentMs: 900, dictorMs: 80 }] })).toBe('rh_note_pause')
    expect(line({ loud: 0.3 })).toBe('rh_note_loud')
    expect(line({ extra: ['the'] })).toBe('rh_note_extra')
    expect(line({})).toBe('rh_note_clean')
  })
  it('нет заметки или неизвестный ключ (запись не воспроизвелась — «error») — реплики нет', () => {
    expect(noteLine(null)).toBeNull(); expect(noteLine(undefined)).toBeNull()
    expect(noteLine({ key: 'error', text: 'x' })).toBeNull(); expect(noteLine({ key: 'tempo' })).toBeNull() // у tempo без kind реплики нет
  })
  it('все реплики заметок есть в каталоге репетиции и стоят в этапе «дубль и зеркало» шлифовки', () => {
    const ids = Object.values(NOTE_LINES)
    expect(new Set(ids).size).toBe(11)
    for (const id of ids) { expect(TEXT[id], id).toBeTruthy(); expect(ACT_LINES.take, id).toContain(id) }
  })
  it('тексты реплик заметок — как у владельца, без . … ! и тире (ломают озвучку ElevenLabs)', () => {
    expect(TEXT.rh_note_fail).toBe('Запись не получилась, попробуем в другой раз')
    expect(TEXT.rh_note_missing_one).toBe('Одно слово потерялось, посмотри, какое')
    expect(TEXT.rh_note_missing_few).toBe('Пара слов потерялась, посмотри, какие')
    expect(TEXT.rh_note_missing_all).toBe('Тебя я почти не расслышал, скажи чуть громче')
    expect(TEXT.rh_note_order).toBe('Порядок слов сбился, послушай')
    expect(TEXT.rh_note_fast).toBe('Ты говоришь быстрее меня, это нормально, но лучше повторять за мной')
    expect(TEXT.rh_note_slow).toBe('Ты говоришь медленнее меня, лучше не медлить')
    expect(TEXT.rh_note_pause).toBe('Не делай такую длинную паузу посреди фразы')
    expect(TEXT.rh_note_loud).toBe('Лучше говорить громче, чтобы я понял твои слабые места')
    expect(TEXT.rh_note_extra).toBe('Мне кажется, я услышал лишние слова')
    expect(TEXT.rh_note_clean).toBe('Всё на месте, звучит естественно, скоро я буду учиться у тебя')
    for (const id of Object.values(NOTE_LINES)) expect(TEXT[id], id).not.toMatch(/[.…!—–]/)
  })
})
