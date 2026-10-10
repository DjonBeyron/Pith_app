import { describe, it, expect } from 'vitest'
import { rawRows } from './sayDiagRaw.js'
import { buildDiagRows, diagReport, GROUP_TITLE } from './sayDiagRows.js'
import { createAttemptLog } from './sayAttemptLast.js'
import { emptyView } from './speechView.js'
import { readSayData } from './sayPhraseData.js'
import { cleanResult } from '../vosk/voskResult.js'
import { buildRaw } from '../vosk/voskRaw.js'

// Админская диагностика: сырой результат Vosk по словам, что отброшено и почему, остановка, решение оценки — «слова нет у Vosk» отличается от «слово выбросил фильтр»
const data = readSayData({ phrase: "I'm trying to please both", threshold: 70 })
const w = (word, conf, start, end) => ({ word, conf, start, end })
const WORDS = [w("i'm", 0.9, 0.1, 0.4), w('trying', 0.9, 0.5, 0.9), w('to', 0.8, 1, 1.1), w('please', 0.8, 1.2, 1.6)]

function attemptFor(words, stats = { stopBy: 'auto', tailMs: 400, afterStopMs: 25, chunkMs: 128, chunks: 30, maxGapMs: 140, lateChunks: 0 }, partial = "i'm trying to please") {
  const log = createAttemptLog({ perf: () => 0, wall: () => 1 })
  log.begin({ engine: 'vosk', reason: 'ready' }, data)
  const text = words.filter(x => x.word !== '[unk]').map(x => x.word).join(' ')
  const cleaned = cleanResult({ text, words, tailWord: 'both' })
  const raw = buildRaw({ rawText: text, stats, cleaned, partial, minConf: 0.3, tailWord: 'both', tailMinConf: 0.15 })
  log.view('vosk', { ...emptyView, status: 'done', final: { text: cleaned.text, confidence: cleaned.confidence }, alternatives: [{ text: cleaned.text }], lastInterim: cleaned.text, raw })
  return log.get()
}
const byId = rows => Object.fromEntries(rows.map(r => [r.id, r]))

describe('rawRows: сырой результат последней попытки', () => {
  it('нет попытки / идёт / нет данных — одна пояснительная строка', () => {
    expect(rawRows(null)).toHaveLength(1); expect(rawRows(null)[0].text).toContain('после первой попытки')
    expect(rawRows({ status: 'run' })[0].text).toContain('идёт')
    expect(rawRows({ status: 'failed', engine: 'system', raw: null, verdict: null })[0].text).toContain('данных нет')
  })

  it('Vosk НЕ выдал «both» вообще: слов 4, «both» в сыром ответе нет; решение «засчитано 5/6, порог 70%, не услышаны: both (Vosk его не выдал)»', () => {
    const rows = byId(rawRows(attemptFor(WORDS)))
    expect(rows['rawword-3'].text).toContain('«please» — уверенность 0,80, время 1,20–1,60 с — принято')
    expect(rows['rawword-4']).toBeUndefined()
    expect(rows.rawpartial.text).toContain("«i'm trying to please»")
    expect(rows.rawkept.text).toContain("«i'm trying to please»")
    expect(rows.rawstop.text).toContain('авто-стоп'); expect(rows.rawstop.text).toContain('тишины в хвост досылали 400 мс')
    expect(rows.rawaudio.text).toContain('провалов звука нет')
    expect(rows.rawverdict).toMatchObject({ level: 'warn' })
    expect(rows.rawverdict.text).toBe('засчитано: совпало 5 из 6 слов (83%), порог 70%, не услышаны: both (Vosk его не выдал)')
    expect(rows.rawverdict.hint).toContain('услышанное, а не эталон')
  })

  it('Vosk выдал «both», но уверенность 0.1 ниже мягкого порога 0.15: строка «ОТБРОШЕНО» с причиной, в оценку слово не ушло', () => {
    const rows = byId(rawRows(attemptFor([...WORDS, w('both', 0.1, 1.7, 2)])))
    expect(rows['rawword-4']).toMatchObject({ level: 'bad' })
    expect(rows['rawword-4'].text).toBe('«both» — уверенность 0,10, время 1,70–2,00 с — ОТБРОШЕНО: уверенность 0,10 ниже порога 0,15 (для последнего слова фразы порог мягче)')
    expect(rows.rawkept.text).toContain('отброшено слов: 1')
    expect(rows.rawverdict.text).toContain('не услышаны: both (Vosk выдал, но отбросил наш фильтр)')
  })

  it('«both» принято → все слова, решение «ok» без пропусков; [unk] — отдельная причина', () => {
    const ok = byId(rawRows(attemptFor([...WORDS, w('both', 0.2, 1.7, 2)])))
    expect(ok['rawword-4'].text).toContain('принято (порог 0,15)')
    expect(ok.rawverdict).toMatchObject({ level: 'ok', text: 'засчитано: совпало 6 из 6 слов (100%), порог 70%' })
    const unk = byId(rawRows(attemptFor([...WORDS, w('[unk]', 1, 1.7, 2)])))
    expect(unk['rawword-4'].text).toContain('ОТБРОШЕНО: это [unk]')
  })

  it('остановка по тапу: сколько ждали последний кусок; опоздавшие куски предупреждают о провалах звука', () => {
    const rows = byId(rawRows(attemptFor(WORDS, { stopBy: 'manual', tailMs: 400, drainMs: 90, afterStopMs: 140, chunkMs: 128, chunks: 20, maxGapMs: 420, lateChunks: 2 })))
    expect(rows.rawstop.text).toContain('нажатие на круг'); expect(rows.rawstop.text).toContain('последний кусок звука ждали 90 мс')
    expect(rows.rawaudio).toMatchObject({ level: 'warn' }); expect(rows.rawaudio.text).toContain('опоздавших кусков 2')
  })

  it('движок без хвоста (старая запись/сбой отправки): строка остановки предупреждает «тишину в хвост НЕ досылали»', () => {
    const rows = byId(rawRows(attemptFor(WORDS, { stopBy: 'auto', tailMs: 0 })))
    expect(rows.rawstop).toMatchObject({ level: 'warn' }); expect(rows.rawstop.text).toContain('НЕ досылали')
  })

  it('окно и «Скопировать отчёт» содержат группу с пословным разбором', () => {
    const c = { now: 1, version: 'x', phrase: data.phrase, mode: 'auto', snap: { cached: true, loaded: true, loading: false, libReady: true, broken: false, brokenUntil: 0, brokenWhy: '' }, info: { users: 1, now: 1, lastError: '' },
      bg: { state: 'idle' }, bgStopped: false, cache: null, cacheApi: true, urlSource: 'env', urlHost: '', pick: { engine: 'vosk', reason: 'ready' }, attempt: attemptFor(WORDS), gate: { action: 'listen' },
      env: { recognition: true, audioSession: true, sessionType: 'play-and-record', sessionApi: true, online: true, saveData: false, netType: '', browser: 'Safari', platform: 'iOS', pwa: true, secure: true, cacheApi: true }, perm: 'granted' }
    const rows = buildDiagRows(c)
    expect(rows.filter(r => r.group === 'raw').length).toBeGreaterThan(5)
    const rep = diagReport(rows, { now: 1 })
    expect(rep).toContain(`${GROUP_TITLE.raw}:`); expect(rep).toContain('Решение оценки — засчитано: совпало 5 из 6'); expect(rep).toContain('Слово 4 — «please»')
  })
})
