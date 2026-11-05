import { describe, it, expect, vi } from 'vitest'
import { phraseKey, phraseEntry, phraseItem, voicePhrase } from './game2Phrase.js'
import { game2DebugFile } from './game2Log.js'
import { GAME2_LINES, HINT_LINE } from './game2Modes.js'
import { game2Cfg } from './game2Cfg.js'
import { wordsPlan } from '../player/modules/rotate-phone/wordLaneStart.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'

describe('озвучка фразы: хранилище', () => {
  it('ключ — rh2_phrase:<слова без знаков в нижнем регистре>; одна фраза — один ключ при любой записи', () => {
    expect(phraseKey("I'm trying to learn")).toBe(phraseKey("I'M  trying, to learn!"))
    expect(phraseKey('Nice to meet you')).toMatch(/^rh2_phrase:nice to meet you$/)
  })
  it('запись → { url, duration, words }; нет файла — null (стенд на оценке таймингов)', () => {
    const map = { [phraseKey('Remember')]: { text: 'Remember', url: 'r2://a.mp3', duration: 1.2, words: [{ w: 'Remember', t: 0.1, e: 0.9 }] } }
    expect(phraseEntry(map, 'remember')).toEqual({ url: 'r2://a.mp3', duration: 1.2, words: [{ w: 'Remember', t: 0.1, e: 0.9 }] })
    expect(phraseEntry(map, 'Other')).toBeNull(); expect(phraseEntry({}, 'x')).toBeNull(); expect(phraseEntry(null, 'x')).toBeNull()
    expect(phraseEntry({ [phraseKey('a')]: { url: '' } }, 'a')).toBeNull()
    expect(phraseItem({ url: 'u' })).toEqual([{ key: 'rh2_phrase', url: 'u' }]); expect(phraseItem(null)).toEqual([])
  })
  it('voicePhrase: ElevenLabs → R2 → запись в карту фраз вместе с таймингами; чужие фразы не стираются', async () => {
    const saved = []
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x'); globalThis.URL.revokeObjectURL = vi.fn()
    const r = await voicePhrase('Nice to meet you', {
      speak: async text => ({ file: { text }, wordTimings: [{ w: 'Nice', t: 0.1, e: 0.4 }] }), upload: async f => `r2://${f.text.length}`, probe: async () => 1.8,
      load: async () => ({ old: { url: 'keep' } }), save: async m => { saved.push(m) },
    })
    expect(r).toEqual({ url: 'r2://16', duration: 1.8, words: [{ w: 'Nice', t: 0.1, e: 0.4 }] })
    expect(saved[0].old).toEqual({ url: 'keep' }); expect(saved[0][phraseKey('Nice to meet you')]).toMatchObject({ text: 'Nice to meet you', url: 'r2://16', duration: 1.8 })
  })
  it('отладка стенда: файл с журналом, строки [game2] выделены', () => {
    const f = game2DebugFile({ now: new Date('2026-11-03T10:00:00Z'), lines: ['[10:00] [rotate] x', '[10:01] [game2] режим «Слушаю»'] })
    expect(f.name).toMatch(/^pithy-game2-debug-2026-11-03/)
    const body = JSON.parse(f.json)
    expect(body.game2).toEqual(['[10:01] [game2] режим «Слушаю»']); expect(body.lines).toHaveLength(2)
  })
})

describe('прогрев звука: ворота', () => {
  it('движок готовит только реплики Пита стенда (нет кусков библиотеки): озвученные rh2_* — первыми, остальные фоном', () => {
    const cfg = game2Cfg()
    expect(cfg.chunks).toEqual([]); expect(cfg.hasAudio).toBe(false); expect(cfg.firstLines).toEqual([...GAME2_LINES, HINT_LINE])
    const lines = normalizeLines({ lines: { rh2_start: { text: 'Одна фраза, сначала слушай, потом лови слово, потом говори со мной, потом сам', url: 'u/start.mp3', duration: 3 }, rh_done: { text: 'Рад, что мы потренировались вместе, хочешь ещё?', url: 'u/done.mp3', duration: 3 } } })
    const plan = wordsPlan({ cfg, lines })
    expect(plan.now.map(i => i.key)).toEqual(['line:rh2_start'])
    expect(plan.late.map(i => i.key)).toEqual(['line:rh_done'])
    expect(plan.firstCount).toBe(1)
  })
})
