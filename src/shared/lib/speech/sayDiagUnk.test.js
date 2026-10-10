import { describe, it, expect } from 'vitest'
import { suspectedUnknownWords, unknownWordHint } from './sayDiagUnk.js'
import { rawRows } from './sayDiagRaw.js'
import { createAttemptLog } from './sayAttemptLast.js'
import { emptyView } from './speechView.js'
import { readSayData } from './sayPhraseData.js'
import { cleanResult } from '../vosk/voskResult.js'
import { buildRaw } from '../vosk/voskRaw.js'

// Диагностика «слово эталона не в словаре Vosk»: в данных урока опечатка «buth» вместо «both» — Vosk молча выбрасывает слово из грамматики, настоящее «both» приходит как [unk]
const w = (word, conf, start, end) => ({ word, conf, start, end })
const SAID = [w("i'm", 0.9, 0.1, 0.4), w('trying', 0.9, 0.5, 0.9), w('to', 0.8, 1, 1.1), w('please', 0.8, 1.2, 1.6)]
const UNK = w('[unk]', 1, 3.81, 4.32)

function attemptFor(phrase, words, tailWord) {
  const data = readSayData({ phrase, threshold: 70 })
  const log = createAttemptLog({ perf: () => 0, wall: () => 1 })
  log.begin({ engine: 'vosk', reason: 'ready' }, data)
  const text = words.filter(x => x.word !== '[unk]').map(x => x.word).join(' ')
  const cleaned = cleanResult({ text, words, tailWord })
  const raw = buildRaw({ rawText: text, stats: { stopBy: 'manual', tailMs: 400 }, cleaned, minConf: 0.3, tailWord, tailMinConf: 0.15 })
  log.view('vosk', { ...emptyView, status: 'done', final: { text: cleaned.text, confidence: cleaned.confidence }, alternatives: [{ text: cleaned.text }], lastInterim: cleaned.text, raw })
  return log.get()
}
const verdict = a => rawRows(a).find(r => r.id === 'rawverdict')

describe('слово эталона не из словаря Vosk', () => {
  it('отчёт владельца: эталон «I\'m trying to please buth», 4 принятых слова + [unk] на конце → подсказка про опечатку в «buth»', () => {
    const a = attemptFor("I'm trying to please buth", [...SAID, UNK], 'buth')
    expect(suspectedUnknownWords(a)).toEqual(['buth'])
    const row = verdict(a)
    expect(row.text).toContain('не услышаны: buth (Vosk его не выдал — на его месте [unk])')
    expect(row.hint).toContain('Слово эталона «buth» Vosk не знает — возможно опечатка в тексте фразы (проверьте написание в ноде; грамматика молча выбрасывает слова, которых нет в словаре модели)')
    expect(row.hint).toContain('услышанное, а не эталон') // прежняя подсказка про порог остаётся
  })

  it('[unk] нет — подсказки нет: обычное «Vosk его не выдал»', () => {
    const a = attemptFor("I'm trying to please both", SAID, 'both')
    expect(suspectedUnknownWords(a)).toEqual([])
    expect(verdict(a).text).toContain('both (Vosk его не выдал)')
    expect(verdict(a).hint).not.toContain('не знает')
  })

  it('[unk] стоит ДО последнего принятого слова — это не хвост эталона, подозрения нет', () => {
    const a = attemptFor("I'm trying to please both", [SAID[0], UNK, ...SAID.slice(1)], 'both')
    expect(suspectedUnknownWords(a)).toEqual([])
  })

  it('слово эталона выдано, но отброшено фильтром, — это не «нет в словаре»: подозрения нет', () => {
    const a = attemptFor("I'm trying to please both", [...SAID, w('both', 0.1, 1.7, 2), UNK], 'both')
    expect(suspectedUnknownWords(a)).toEqual([])
  })

  it('не больше слов, чем [unk] в хвосте; пустые данные и системный движок (raw нет) — пусто', () => {
    const a = attemptFor('please buth buth2', [SAID[3], UNK], 'buth2')
    expect(suspectedUnknownWords(a)).toHaveLength(1)
    expect(suspectedUnknownWords(null)).toEqual([])
    expect(suspectedUnknownWords({ raw: null, verdict: null })).toEqual([])
    expect(unknownWordHint('x')).toContain('«x»')
  })
})
