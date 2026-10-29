import { describe, it, expect, vi } from 'vitest'
import { makeMirrorDictor, takeWordsOf, buildMirror, DICTOR_GAP_MS, DICTOR_TAIL_MS } from './rehearsalMirror.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING } from './mirror/mirrorFixtures.js'

// Сборка экрана зеркала: диктор из кусков библиотеки, слова слушателя игры → шкала записи, measure / note / темп
const LIB = [{ ms: 400, lead: 50 }, { ms: 500, lead: 30 }, { ms: 600, lead: 0 }]
const lib = i => LIB[i] ?? null
const ms = sec => Math.round(sec * 1000)

/** Fake-таймеры: setTimer складывает вызовы, fire() запускает их в порядке времени */
function timers() {
  const list = []
  let id = 0
  return { setTimer: (fn, at) => { list.push({ id: ++id, fn, at }); return id }, clearTimer: i => { const k = list.findIndex(t => t.id === i); if (k >= 0) list.splice(k, 1) }, list, fire() { list.sort((a, b) => a.at - b.at).splice(0).forEach(t => t.fn()) } }
}

describe('takeWordsOf: слова слушателя → шкала записи', () => {
  it('сдвиг = старт слушателя − старт записи; слушатель стартовал раньше (под плашкой) — слова едут к нулю', () => {
    const l = { startedAt: 7600, words: [{ word: "i'm", conf: 1, start: 3000, end: 3300 }, { word: 'trying', conf: 1, start: 3380, end: 3900 }] }
    expect(takeWordsOf([l], 10000)).toEqual([{ word: "i'm", conf: 1, start: 600, end: 900 }, { word: 'trying', conf: 1, start: 980, end: 1500 }])
  })
  it('слова целиком до записи отбрасываются, начавшееся до — обрезается нулём; несколько слушателей склеиваются по времени', () => {
    const a = { startedAt: 0, words: [{ word: 'old', start: 100, end: 300 }, { word: 'edge', start: 900, end: 1200 }] }
    const b = { startedAt: 2000, words: [{ word: 'new', start: 300, end: 700 }] } // 2300…2700 по часам
    expect(takeWordsOf([b, a], 1000).map(x => [x.word, x.start, x.end])).toEqual([['edge', 0, 200], ['new', 1300, 1700]])
  })
  it('нет слов / нет слушателей — пусто', () => {
    expect(takeWordsOf([], 5)).toEqual([]); expect(takeWordsOf([{ startedAt: 1 }], 5)).toEqual([])
  })
})

describe('makeMirrorDictor', () => {
  it('тайминги слов — dictorPlan по длинам библиотеки (пауза 80 мс); play включает файлы по плану, файл — на lead раньше голоса', async () => {
    const t = timers()
    const play = vi.fn(() => true), speak = vi.fn(), hold = { holdFor: vi.fn() }
    const d = makeMirrorDictor({ chunks: CHUNKS, rate: 1, lang: 'en-US', lib, row: c => ({ key: c.toLowerCase() }), play, speak, hold, ...t })
    expect(DICTOR_GAP_MS).toBe(80)
    expect(d.words.map(x => x.word)).toEqual(["I'm", 'trying', 'to', 'learn'])
    expect(d.words[0]).toMatchObject({ start: 0, end: 400 }); expect(d.words[1]).toMatchObject({ start: 480, end: 980 })
    expect(d.durationMs).toBe(980 + 80 + 600); expect(d.leadMs).toBe(50)
    const done = vi.fn(); d.play().then(done)
    expect(hold.holdFor).toHaveBeenCalledWith(50 + d.durationMs + DICTOR_TAIL_MS)
    expect(t.list.map(x => x.at).sort((a, b) => a - b).slice(0, 3)).toEqual([0, 500, 1060 + 50]) // куски 0, 1 (480+50−30), 2 (980+80+50−0)
    t.fire(); await Promise.resolve()
    expect(play.mock.calls.map(c => c[0])).toEqual(["i'm", 'trying', 'to learn']); expect(speak).not.toHaveBeenCalled(); expect(done).toHaveBeenCalled()
  })
  it('куска нет в слотах — голос системы (speakWord с языком); скорость голоса растягивает тайминги', () => {
    const t = timers()
    const play = vi.fn(() => false), speak = vi.fn()
    const d = makeMirrorDictor({ chunks: ['hi'], rate: 2, lang: 'en-GB', lib: () => ({ ms: 600, lead: 100 }), row: () => null, play, speak, hold: null, ...t })
    expect(d.words[0]).toMatchObject({ start: 0, end: 300 }); expect(d.leadMs).toBe(50)
    d.play(); t.fire()
    expect(play).not.toHaveBeenCalled(); expect(speak).toHaveBeenCalledWith('hi', 'en-GB')
  })
  it('нет озвучки в библиотеке — оценка длины куска, слова всё равно есть', () => {
    const d = makeMirrorDictor({ chunks: CHUNKS, lib: () => null, row: () => null, hold: null, ...timers() })
    expect(d.words).toHaveLength(4); expect(d.durationMs).toBeGreaterThan(500); expect(d.leadMs).toBe(0)
  })
  it('cancel: не включившийся звук не включится, ждущий play() завершается', async () => {
    const t = timers(); const speak = vi.fn()
    const d = makeMirrorDictor({ chunks: CHUNKS, lib, row: () => null, speak, hold: null, ...t })
    const done = vi.fn(); d.play().then(done)
    d.cancel(); t.fire(); await Promise.resolve()
    expect(speak).not.toHaveBeenCalled(); expect(done).toHaveBeenCalled()
  })
})

describe('buildMirror', () => {
  const dictor = { ...DICTOR, leadMs: 0, play() {}, cancel() {} }
  const msWords = student => student.words.map(x => ({ ...x, start: ms(x.start), end: ms(x.end) }))
  it('чистый дубль: student с url и мс, measure, заметка «чисто», темп около 1', () => {
    const m = buildMirror({ chunks: CHUNKS, take: { url: 'blob:t', durationMs: 2600, rms: 0.09 }, words: msWords(STUDENT_CLEAN), dictor, dictorRms: 0.1 })
    expect(m.student).toMatchObject({ url: 'blob:t', durationMs: 2600, unit: 'ms', rms: 0.09 })
    expect(m.measure).toMatchObject({ clean: true, missing: [] }); expect(m.note.key).toBe('clean')
    expect(m.tempo).toBeGreaterThan(0.9); expect(m.tempo).toBeLessThan(1.1)
    expect(m.dictor).toBe(dictor)
  })
  it('потерян кусок — заметка «потерялось»; громкость диктора неизвестна (null) — про громкость молчим', () => {
    const m = buildMirror({ chunks: CHUNKS, take: { url: 'blob:t', durationMs: 2200, rms: 0.001 }, words: msWords(STUDENT_MISSING), dictor, dictorRms: null })
    expect(m.note).toMatchObject({ key: 'missing' }); expect(m.measure.loud).toBeNull()
  })
  it('записи нет: student и measure null, темп null, заметка о сбое; диктор остаётся', () => {
    const m = buildMirror({ chunks: CHUNKS, take: null, words: [], dictor })
    expect(m).toMatchObject({ student: null, measure: null, tempo: null, dictor }); expect(m.note.key).toBe('fail')
  })
  it('дубль записан, но Vosk не дал слов — «почти не расслышал»', () => {
    const m = buildMirror({ chunks: CHUNKS, take: { url: 'blob:t', durationMs: 3000, rms: 0.05 }, words: [], dictor })
    expect(m.measure.missing).toEqual(CHUNKS); expect(m.note.key).toBe('missing'); expect(m.tempo).toBeNull()
  })
})
