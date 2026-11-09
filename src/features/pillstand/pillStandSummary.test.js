import { describe, it, expect } from 'vitest'
import { honesty, segments, voicePeriods, voiceEndFor } from './pillStandHonesty.js'
import { summaryText, resultLine } from './pillStandSummary.js'

// Синтетическая трасса: цель «nice to meet you», голос 1000…2000 мс (rms 0,2), черновики с перестройкой и «додуманным» словом, слово без голоса, заливка, зачёт
const lv = (t, rms) => ({ t, k: 'level', rms })
const voice = (a, b, rms = 0.2) => { const out = []; for (let t = a; t <= b; t += 50) out.push(lv(t, rms)); return out }
const T = [
  { t: 0, k: 'session' },
  { t: 100, k: 'target', n: 0, mode: 'words', lang: 'en', say: 'Nice to meet you', shown: 'Nice to meet you' },
  { t: 110, k: 'run' },
  { t: 120, k: 'vosk-start' },
  ...voice(1000, 2000),
  ...voice(2050, 6900, 0.001),
  { t: 1000, k: 'gate', open: true },
  { t: 1300, k: 'vosk-partial', raw: { partial: 'nice' } },
  { t: 1310, k: 'word', index: 0, text: 'nice', draft: true },
  { t: 1320, k: 'fill', goal: 0.25, shown: 0.05 },
  { t: 1380, k: 'fill', goal: 0.25, shown: 0.25 },
  { t: 1600, k: 'vosk-partial', raw: { partial: 'nice the' } },
  { t: 1700, k: 'vosk-partial', raw: { partial: 'nice to meet' } },
  { t: 1710, k: 'word', index: 1, text: 'to', draft: true },
  { t: 1711, k: 'word', index: 2, text: 'meet', draft: true },
  { t: 1800, k: 'vosk-partial', raw: { partial: 'nice meet' } },
  { t: 1810, k: 'word', index: 1, text: 'to', draft: true, gone: true },
  { t: 1950, k: 'vosk-partial', raw: { partial: 'nice to meet you' } },
  { t: 2000, k: 'log', text: '[fill] неверное слово «the», ждём «to»' },
  { t: 2150, k: 'gate', open: false },
  { t: 2200, k: 'vosk-final', raw: { text: 'nice to meet you', result: [{ word: 'nice', conf: 1 }, { word: 'to', conf: 0.8 }] }, stopBy: 'endpoint' },
  { t: 2300, k: 'result', ok: true, ratio: 1, clean: true },
  { t: 5000, k: 'word', index: 3, text: 'you', draft: false },
  { t: 6800, k: 'fill', goal: 0.9, shown: 0.5 },
  { t: 7000, k: 'target', n: 1, mode: 'words', lang: 'en', say: 'See you later', shown: 'See you later' },
]

describe('стенд пилюль: метрики честности', () => {
  it('отрезки по целям; цель без запуска пилюли не в счёт', () => {
    expect(segments(T)).toHaveLength(1)
    expect(segments(T)[0].target.n).toBe(0)
  })
  it('голос, черновики, перестройки, додуманные слова, откаты, неверные слова', () => {
    const s = honesty(T).segs[0]
    expect(s.voiceStart).toBe(900)
    expect(s.partials.map(p => p.text)).toEqual(['nice', 'nice the', 'nice to meet', 'nice meet', 'nice to meet you'])
    expect(s.rebuilds).toBe(3) // «nice the» → «nice to meet», «nice to meet» → «nice meet», «nice meet» → «nice to meet you»
    expect(s.invented).toEqual([{ w: 'the', partial: 1, final: 0 }])
    expect(s.backs).toEqual([{ t: 1710, index: 1, text: 'to' }])
    expect(s.wrongs).toEqual([{ t: 1900, word: 'the', expect: 'to' }])
  })
  it('ложные срабатывания: слово и заливка без голоса', () => {
    const s = honesty(T).segs[0]
    expect(s.falses.map(f => f.kind)).toEqual(['слово без голоса', 'заливка без голоса'])
    expect(s.falses[0].text).toBe('you')
  })
  it('задержки: голос → черновик, слово → заливка, конец голоса → зачёт', () => {
    const s = honesty(T).segs[0]
    expect(s.voiceToPartial).toBe(300)
    expect(s.toFill[0]).toEqual({ word: 'nice', ms: 70 })
    expect(s.result.afterVoice).toBe(300)
    const t = honesty(T).totals
    expect(t).toMatchObject({ targets: 1, wins: 1, falses: 2, rebuilds: 3, backs: 1, wrongs: 1, voiceToPartial: 300, afterVoice: 300 })
  })
  it('слово, которого нет в итоге Vosk после него, — ложное; итога после слова не было — «без итога»', () => {
    const ev = [{ t: 0, k: 'target', n: 0, mode: 'word', lang: 'en', say: 'cat', shown: 'кот' }, { t: 1, k: 'run' }, ...voice(100, 600), { t: 300, k: 'word', index: 0, text: 'cat', draft: true }, { t: 900, k: 'vosk-final', raw: { text: 'hat' } }, { t: 950, k: 'word', index: 1, text: 'dog' }]
    const s = honesty(ev).segs[0]
    expect(s.falses.filter(f => f.kind === 'слова нет в итоге Vosk').map(f => f.text)).toEqual(['cat'])
    expect(s.noFinal).toBe(1)
  })
  it('конец голоса — по отрезку речи: зачёт посреди речи — отрицательный', () => {
    const ps = voicePeriods([100, 150, 200, 800, 850])
    expect(ps).toEqual([{ a: 100, b: 200 }, { a: 800, b: 850 }])
    expect(voiceEndFor(ps, 820) - 820).toBe(30)
    expect(resultLine({ ok: true, ratio: 1, clean: true, endMs: -120 })).toBe('зачёт ✓ ratio 1,00, чисто, за 120 мс до конца голоса')
    expect(resultLine({ ok: true, ratio: 0.75, clean: false, afterVoiceMs: 410 })).toBe('зачёт ✓ ratio 0,75, нечисто, 410 мс от конца голоса')
  })
})

describe('стенд пилюль: сводка текстом', () => {
  it('шапка, итог по честности и блок цели', () => {
    const text = summaryText({ version: '3.3.177', device: 'iPhone iOS 18.1 375×812 @3', seed: 'abc', mode: 'words', lang: 'en', len: 'any', audio: 'audio/mp4' }, T)
    const lines = text.split('\n')
    expect(lines[0]).toBe('Стенд пилюль — сводка')
    expect(lines[1]).toBe('версия 3.3.177 · iPhone iOS 18.1 375×812 @3 · сид abc · По словам (проход 1) · EN · длина любые · звук audio/mp4')
    expect(lines[2]).toBe('целей 1, зачётов 1; ложных срабатываний 2; додумано 1 из 10 услышанных слов (10 %); перестроек черновика 3 из 5 смен; откатов 1; неверных слов 1')
    expect(lines[3]).toBe('задержки (медиана): голос → первый черновик 300 мс, слово → заливка дошла 70 мс, конец голоса → зачёт 300 мс')
    expect(text).toContain('#1 «Nice to meet you» — EN, По словам (проход 1)')
    expect(text).toContain('итоги: +2100 «nice to meet you» (движок сам) [nice 1, to 0,8]')
    expect(text).toContain('додумано Vosk (нет в цели): «the» черн.×1')
    expect(text).toContain('ложные срабатывания: +4900 слово без голоса «you» · +6700 заливка без голоса «цель 0,90»')
    expect(text).toContain('итог: зачёт ✓ ratio 1,00, чисто, +2200 мс, 300 мс от конца голоса')
  })
})
