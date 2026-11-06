import { describe, it, expect, vi } from 'vitest'
import { createGameJournal, journalFileName, dayTime, JOURNAL_MAX, NOTE_MAX_CHARS, gameJournal } from './gameJournal.js'
import { pLog, clearPlayerLog } from './debug.js'
import { gameAudioNote, JOURNAL_KINDS } from './gameAudioSink.js'

// Журнал игры на весь сеанс страницы (шестерёнка игры → «Скачать журнал»): кольцевой буфер ~3000 строк, метка — мс от загрузки и время дня; сюда идут все pLog и события звука.
const at = new Date(2026, 10, 6, 14, 3, 27, 45)

describe('журнал игры: строки и кольцо', () => {
  it('строка: мс от загрузки страницы (performance.now), время дня, текст; объекты — JSON', () => {
    let t = 1234.56
    const j = createGameJournal({ now: () => t, clock: () => at })
    j.add('[audio] ctx', { state: 'running' })
    expect(j.lines()[0]).toBe('   1234.6 14:03:27.045 [audio] ctx {"state":"running"}')
    t = 99999.9; j.add('x')
    expect(j.lines()[1].startsWith('  99999.9 ')).toBe(true)
    expect(dayTime(at)).toBe('14:03:27.045')
  })
  it('потолок ~3000 строк: старое вытесняется пачкой, счёт вытесненного в заголовке', () => {
    expect(JOURNAL_MAX).toBe(3000)
    const j = createGameJournal({ max: 10, evict: 3, now: () => 0, clock: () => at })
    for (let i = 0; i < 25; i++) j.add(`s${i}`)
    expect(j.size()).toBeLessThanOrEqual(10); expect(j.lines().at(-1)).toContain('s24'); expect(j.dropped()).toBe(25 - j.size())
    expect(j.text(['шапка'])).toMatch(/^шапка\nстрок в журнале: \d+, вытеснено старых: \d+\n\n/)
  })
  it('событие звука обрезается; пустой журнал — пометка', () => {
    const j = createGameJournal({ now: () => 0, clock: () => at })
    expect(j.text([])).toContain('(журнал пуст)')
    j.note('mic-hold', { why: 'x'.repeat(NOTE_MAX_CHARS * 2) })
    expect(j.lines()[0]).toContain('[note] mic-hold {"why":"xxx'); expect(j.lines()[0].endsWith('…')).toBe(true)
    j.clear(); expect(j.size()).toBe(0)
  })
  it('имя файла: pithy-journal-<дата>_<время>.txt', () => { expect(journalFileName(at)).toBe('pithy-journal-2026-11-06_14-03-27.txt') })
})

describe('журнал игры: подключён в одном месте', () => {
  it('каждая строка pLog попадает в журнал и остаётся после очистки журнала плеера', () => {
    pLog('[pause] приложение ушло: тест', { n: 1 })
    clearPlayerLog()
    expect(gameJournal.lines().at(-1)).toMatch(/\[pause\] приложение ушло: тест \{"n":1\}$/)
  })
  it('события звука (тип сессии, глушение дорожки, прерывания, отметки старта) — в журнал даже без приёмника отладки; game-ctx не дублируется', () => {
    const spy = vi.spyOn(gameJournal, 'note')
    gameAudioNote('audio-session', { mode: 'play-and-record', ok: true })
    gameAudioNote('game-ctx', { state: 'running' })
    expect(spy).toHaveBeenCalledTimes(1); expect(spy).toHaveBeenCalledWith('audio-session', { mode: 'play-and-record', ok: true })
    expect([...JOURNAL_KINDS]).toEqual(expect.arrayContaining(['audio-session', 'mic-hold', 'audio-interrupt', 'start-mark']))
    spy.mockRestore()
  })
})
