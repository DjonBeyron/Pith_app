import { describe, it, expect } from 'vitest'
import { playSpans, litSchedule } from './mirrorSpans.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING, STUDENT_PAUSE } from './mirrorFixtures.js'

const spans = student => playSpans({ dictor: DICTOR, student, chunks: CHUNKS })

describe('playSpans: когда звучит каждый кусок', () => {
  it('диктор: отрезки трёх кусков в мс его голоса (слова «to learn» собраны в один кусок)', () => {
    expect(spans(null).dictor).toEqual([{ i: 0, at: 0, until: 300 }, { i: 1, at: 380, until: 900 }, { i: 2, at: 980, until: 1600 }])
    expect(spans(null).student).toBeNull()
  })
  it('человек: слова Vosk в секундах → мс от старта записи (реакция до первого слова сохраняется)', () => {
    expect(spans(STUDENT_CLEAN).student).toEqual([{ i: 0, at: 400, until: 700 }, { i: 1, at: 780, until: 1300 }, { i: 2, at: 1380, until: 2000 }])
    expect(playSpans({ dictor: DICTOR, student: { words: [{ word: "i'm", start: 400, end: 700 }], unit: 'ms' }, chunks: CHUNKS }).student[0]).toEqual({ i: 0, at: 400, until: 700 })
  })
  it('пропущенный кусок отрезка не имеет — гореть ему нечему', () => {
    expect(spans(STUDENT_MISSING).student.map(s => s.i)).toEqual([0, 2])
  })
  it('нет слов диктора — отрезков нет', () => {
    expect(playSpans({ dictor: { words: [] }, student: null, chunks: CHUNKS }).dictor).toEqual([])
    expect(playSpans({ dictor: null, student: null, chunks: CHUNKS }).dictor).toEqual([])
  })
})

describe('litSchedule: подсветка по ходу звука', () => {
  it('диктор: события в порядке времени, смещение на leadMs', () => {
    const ev = litSchedule(spans(null).dictor, 25)
    expect(ev.slice(0, 3)).toEqual([{ at: 25, i: 0, on: true }, { at: 325, i: 0, on: false }, { at: 405, i: 1, on: true }])
    expect(ev).toHaveLength(6)
    expect(ev.every((e, k) => k === 0 || e.at >= ev[k - 1].at)).toBe(true)
  })
  it('запись человека: время от старта записи; пропущенный кусок не горит; долгая пауза — зазор между «погас» и «зажёгся»', () => {
    expect(litSchedule(spans(STUDENT_CLEAN).student)[0]).toEqual({ at: 400, i: 0, on: true })
    expect(litSchedule(spans(STUDENT_MISSING).student).map(e => e.i)).not.toContain(1)
    const ev = litSchedule(spans(STUDENT_PAUSE).student)
    const off1 = ev.find(e => e.i === 1 && !e.on), on2 = ev.find(e => e.i === 2 && e.on)
    expect(on2.at - off1.at).toBeGreaterThan(1000)
  })
  it('пустой вход — пустое расписание', () => {
    expect(litSchedule(null)).toEqual([])
    expect(litSchedule([])).toEqual([])
  })
})
