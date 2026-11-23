import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildAlign, alignAudio } from './voskAlign.js'
import { recognizeBuffer, alignModel, decodeAudio } from './voskAlignRun.js'
import { checkWords } from './voskAlignFill.js'
import { mouthTrack } from '../../../features/player/modules/rotate-phone/wordLaneVisemes.js'
import { normalizeLines, linesToSave, playableLines, lineMs } from '../../../features/player/modules/rotate-phone/wordLaneCatLines.js'
import { auditVoice } from '../../../features/admin/speech/voiceAudit.js'

// Разметка рта своего файла целиком: итог распознавания → words в формате реплики, сбои движка, запуск Vosk на готовом буфере (подставная модель), рот игры на результате.
const RATE = 16000
const TEXT = 'Ничего, попробуем ещё раз. Потом выбери дорожку!'
// итог настоящего Vosk на этой фразе (прогон в Chromium, русская модель small 0.22; запись — espeak, слова с паузами)
const REAL = [['ничего', 0.39, 1.02], ['попробуем', 1.02, 1.8], ['еще', 1.86, 2.28], ['раз', 2.82, 3.21], ['потом', 3.21, 3.69], ['выбери', 3.78, 4.29], ['дорожку', 4.32, 4.86]].map(([word, start, end]) => ({ word, start, end, conf: 1 }))
const SPANS = [{ from: 0.4, to: 2.3 }, { from: 2.84, to: 4.8 }], DUR = 4.93
const pcm = () => ({ samples: new Float32Array(RATE * 2).map((_, i) => (i > 3200 && i < 28000 ? 0.2 * Math.sin(i / 11) : 0)), rate: RATE, duration: 2 })

// Порт wordTimingsFromAlignment из supabase/functions/tts-elevenlabs/index.ts (символьные тайминги ElevenLabs → слова) — эталон формата
function elevenWords(characters, starts, ends) {
  const r = v => Math.round(v * 100) / 100, out = []
  let word = '', ws = 0, we = 0
  characters.forEach((ch, i) => { if (/\s/.test(ch)) { if (word) { out.push({ w: word, t: r(ws), e: r(we) }); word = '' } return } if (!word) ws = starts[i]; we = ends[i]; word += ch })
  if (word) out.push({ w: word, t: r(ws), e: r(we) })
  return out
}

describe('итог разметки — тот же формат, что у озвучки ElevenLabs', () => {
  it('слова как в тексте (со знаками), времена в секундах с сотыми, поля w / t / e; сверх них — только метка a', () => {
    expect(readFileSync(new URL('../../../../supabase/functions/tts-elevenlabs/index.ts', import.meta.url), 'utf8')).toContain('out.push({ w: word, t: r(wordStart), e: r(wordEnd) })')
    const chars = [...TEXT], eleven = elevenWords(chars, chars.map((_, i) => i * 0.1003), chars.map((_, i) => i * 0.1003 + 0.09))
    const own = buildAlign({ text: TEXT, vosk: REAL, spans: SPANS, duration: DUR })
    expect(own.method).toBe('vosk'); expect(own.found).toBe(7); expect(own.approx).toBe(false)
    expect(own.words.map(w => w.w)).toEqual(eleven.map(w => w.w)) // те же слова, тот же счёт
    for (const w of own.words) {
      expect(Object.keys(w).sort()).toEqual(['a', 'e', 't', 'w']); expect(Object.keys(eleven[0]).sort()).toEqual(['e', 't', 'w'])
      expect(Math.round(w.t * 100) / 100).toBe(w.t); expect(Math.round(w.e * 100) / 100).toBe(w.e)
    }
    expect(own.words[2]).toEqual({ w: 'ещё', t: 1.86, e: 2.28, a: 'v' }) // «еще» модели = «ещё» текста
  })
  it('реплика со своей разметкой проходит настройки и игру так же, как озвучка ElevenLabs: не устаревшая, тайминги целы', () => {
    const { words } = buildAlign({ text: 'Поехали! Жми на старт', vosk: [['поехали', 0.2, 0.8], ['жми', 1, 1.3], ['на', 1.3, 1.45], ['старт', 1.45, 2]].map(([word, start, end]) => ({ word, start, end })), spans: [{ from: 0.2, to: 2 }], duration: 2.2 })
    const raw = { lines: { race_start: { text: 'Поехали! Жми на старт', custom: true, url: 'https://r2/own.mp3', duration: 2.2, words, said: 'Поехали! Жми на старт' } } }
    const lines = normalizeLines(raw), l = lines.race_start
    expect(l.words).toEqual(words); expect(l.url).toBe('https://r2/own.mp3')
    expect(playableLines(lines).race_start).toEqual(l) // игра играет файл и берёт тайминги
    expect(normalizeLines(linesToSave(lines)).race_start).toEqual(l) // сохранение не теряет метки
    expect(auditVoice(raw).byId.race_start.status).toBe('ok')
    expect(lineMs(l)).toBe(2200)
  })
})

describe('рот игры на результате разметки (mouthTrack)', () => {
  const inWords = (track, words, k = 1000) => track.every(s => words.some(w => s.at >= w.t * k - 1 && s.end <= w.e * k + 1))
  it('формы рта попадают в интервалы слов; пауза записи — рот закрыт', () => {
    const { words } = buildAlign({ text: TEXT, vosk: REAL, spans: SPANS, duration: DUR })
    const track = mouthTrack(TEXT, DUR * 1000, words, DUR)
    expect(track.length).toBeGreaterThan(12); expect(inWords(track, words)).toBe(true)
    expect(track.some(s => s.at < 2820 && s.end > 2300)).toBe(false) // пауза «ещё | раз» 2,28–2,82 с
    expect(track[0].at).toBeGreaterThanOrEqual(390) // тишина в начале файла остаётся тишиной
  })
  it('частично найденные и размеченные по громкости слова тоже дают дорожку внутри своих слов', () => {
    for (const vosk of [REAL.filter((_, i) => i % 2 === 0), REAL.slice(0, 1), []]) {
      const r = buildAlign({ text: TEXT, vosk, spans: SPANS, duration: DUR })
      expect(checkWords(r.words, DUR, 7)).toEqual([]); expect(inWords(mouthTrack(TEXT, DUR * 1000, r.words, DUR), r.words)).toBe(true)
    }
  })
})

describe('качество и сбои', () => {
  it('найдено меньше 60 % — «приблизительно», ненайденные перечислены; слово чужого письма названо', () => {
    const r = buildAlign({ text: 'Ничего, попробуем ещё раз — okay?', vosk: REAL.slice(0, 2), spans: SPANS, duration: DUR })
    expect(r).toMatchObject({ method: 'vosk+fill', found: 2, total: 5, approx: true }); expect(r.missing).toEqual(['ещё', 'раз', 'okay?'])
    expect(r.notes.join(' ')).toContain('не знает такое письмо: «okay?»')
  })
  it('Vosk слышит другой текст (много лишних слов) — «приблизительно», даже если большинство слов нашлось', () => {
    const extra = ['ну', 'вот', 'так', 'это', 'да', 'нет'].map((word, i) => ({ word, start: 5 + i, end: 5.5 + i }))
    const r = buildAlign({ text: 'ничего попробуем ещё раз потом выбери дорожку сейчас', vosk: [...REAL, ...extra], spans: [{ from: 0.4, to: 11 }], duration: 12 })
    expect(r.found).toBe(7); expect(r.approx).toBe(true); expect(r.notes.join(' ')).toContain('лишних слов')
  })
  it('пустой итог Vosk → по громкости (level); движок не сработал → level с причиной; голоса не видно → even, тайминги не отдаются', () => {
    expect(buildAlign({ text: TEXT, vosk: [], spans: SPANS, duration: DUR })).toMatchObject({ method: 'level', found: 0, approx: true })
    const off = buildAlign({ text: TEXT, vosk: null, why: 'Vosk не сработал: нет модели', spans: SPANS, duration: DUR })
    expect(off.method).toBe('level'); expect(off.words).toHaveLength(7); expect(off.notes).toContain('Vosk не сработал: нет модели')
    const even = buildAlign({ text: TEXT, vosk: null, spans: [], duration: DUR })
    expect(even.method).toBe('even'); expect(even.words).toBeNull()
    expect(buildAlign({ text: '…', vosk: [], spans: SPANS, duration: DUR })).toMatchObject({ words: null, total: 0 })
  })
  const deps = over => ({ decode: async () => pcm(), getModel: async () => ({ model: {}, release: vi.fn() }), recognize: async () => ({ words: [{ word: 'теперь', start: 0.3, end: 0.8 }, { word: 'ты', start: 0.9, end: 1.4 }], ms: 5, by: 'final', events: 3 }), ...over })
  it('alignAudio: шаги для человека, модель отпускается, язык по тексту', async () => {
    const steps = [], release = vi.fn(), langs = []
    const r = await alignAudio(new ArrayBuffer(8), 'Теперь ты!', deps({ onStep: s => steps.push(s), getModel: async lang => { langs.push(lang); return { model: {}, release } } }))
    expect(r).toMatchObject({ method: 'vosk', found: 2, total: 2, lang: 'ru', duration: 2 }); expect(r.words.map(w => w.w)).toEqual(['Теперь', 'ты!'])
    expect(steps).toEqual(['слушаю запись (Vosk)…']); expect(release).toHaveBeenCalledTimes(1); expect(langs).toEqual(['ru'])
    expect((await alignAudio(new ArrayBuffer(8), 'Now you', deps({ recognize: async () => ({ words: [] }) }))).lang).toBe('en')
  })
  it('alignAudio: нет модели / таймаут распознавания — не падает, слова по громкости, причина в заметках, модель отпущена', async () => {
    const noModel = await alignAudio(new ArrayBuffer(8), 'Теперь ты', deps({ getModel: async () => { throw new Error('модель Vosk не скачалась: нет сети') } }))
    expect(noModel.method).toBe('level'); expect(noModel.words).toHaveLength(2); expect(noModel.notes[0]).toBe('Vosk не сработал: модель Vosk не скачалась: нет сети')
    const release = vi.fn()
    const slow = await alignAudio(new ArrayBuffer(8), 'Теперь ты', deps({ getModel: async () => ({ model: {}, release }), recognize: async () => { throw new Error('Vosk не успел за 20 с') } }))
    expect(slow.method).toBe('level'); expect(slow.notes[0]).toContain('не успел за 20 с'); expect(release).toHaveBeenCalledTimes(1)
  })
  it('alignAudio: файл не декодируется — ошибка наружу (размечать нечего); без Web Audio — понятный текст', async () => {
    await expect(alignAudio(new ArrayBuffer(8), 'Теперь ты', deps({ decode: async () => { throw new Error('файл не декодируется как звук') } }))).rejects.toThrow('не декодируется')
    await expect(decodeAudio(new ArrayBuffer(8), { Offline: null })).rejects.toThrow('нет Web Audio')
  })
})

describe('Vosk на готовом буфере (не микрофон)', () => {
  // подставная модель: как воркер vosk-browser — на каждый кусок звука одно сообщение (partialresult; на «паузе» — result со словами), на запрос итога — result
  const fakeModel = ({ midAt = -1, final = [], silent = false } = {}) => {
    const log = { fed: 0, removed: 0, grammar: null, rate: null, words: null }
    class KaldiRecognizer {
      constructor(rate, grammar) { log.rate = rate; log.grammar = grammar; this.on_ = {} }
      on(ev, fn) { this.on_[ev] = fn }
      setWords(v) { log.words = v }
      acceptWaveformFloat() { const n = log.fed++; if (silent) return; queueMicrotask(() => (n === midAt ? this.on_.result({ result: { text: 'раз', result: [{ word: 'раз', start: 0.1, end: 0.4, conf: 1 }] } }) : this.on_.partialresult({ result: { partial: '' } }))) }
      retrieveFinalResult() { if (!silent) queueMicrotask(() => this.on_.result({ result: { text: 'x', result: final } })) }
      remove() { log.removed++ }
    }
    return { model: { KaldiRecognizer }, log }
  }
  it('звук уходит кусками, следом тишина и запрос итога; слова собираются из всех result, конец — итог после ответов на все куски', async () => {
    const { model, log } = fakeModel({ midAt: 1, final: [{ word: 'два', start: 1.2, end: 1.6, conf: 1 }] })
    const r = await recognizeBuffer(model, new Float32Array(RATE), RATE, '["раз два","[unk]"]')
    expect(log.fed).toBe(5) // 4 куска по 250 мс + тишина
    expect(r.words.map(w => w.word)).toEqual(['раз', 'два']); expect(r.by).toBe('final'); expect(r.events).toBe(6)
    expect(log).toMatchObject({ rate: RATE, grammar: '["раз два","[unk]"]', words: true, removed: 1 })
  })
  it('воркер молчит — ошибка по потолку времени, распознаватель удалён', async () => {
    const { model, log } = fakeModel({ silent: true })
    await expect(recognizeBuffer(model, new Float32Array(RATE), RATE, '["a"]', { timeoutMs: 30 })).rejects.toThrow('не успел')
    expect(log.removed).toBe(1)
  })
  it('модель: уже в памяти — берётся сразу; нет в памяти — скачать, прогреть, дождаться; не прогрелась — ошибка с причиной и модель отпущена', async () => {
    const release = vi.fn(), ready = { getModel: () => 'M' }
    expect(await alignModel('ru', { rt: ready, acquire: () => release })).toEqual({ model: 'M', release })
    let model = null
    const calls = [], rt = { getModel: () => model, warmNow: t => { calls.push(`warm:${t}`); model = 'M2' }, whenSettled: async () => ({ ok: true }) }
    const steps = []
    const got = await alignModel('ru', { rt, acquire: () => { calls.push('acquire'); return release }, url: '/m.tar.gz', fetchModel: async (url, o) => { calls.push(`fetch:${url}:${o.allowNetwork}`); return { blob: 'B' } }, mode: () => 'auto', onStep: s => steps.push(s) })
    expect(got.model).toBe('M2'); expect(calls).toEqual(['fetch:/m.tar.gz:true', 'acquire', 'warm:tap']); expect(steps[0]).toBe('загружаю русскую модель Vosk…')
    const rel2 = vi.fn(), bad = { getModel: () => null, warmNow: () => {}, whenSettled: async () => ({ ok: false, text: 'ошибка распаковки' }) }
    await expect(alignModel('en', { rt: bad, acquire: () => rel2, fetchModel: async () => ({ blob: 'B' }), mode: () => 'auto' })).rejects.toThrow('не загрузилась в память: ошибка распаковки'); expect(rel2).toHaveBeenCalled()
    await expect(alignModel('en', { rt: bad, fetchModel: async () => { throw new Error('нет сети') }, mode: () => 'auto' })).rejects.toThrow('модель Vosk не скачалась: нет сети')
    const unload = vi.fn(), sys = await alignModel('ru', { rt: bad, fetchModel: async () => ({ blob: 'B' }), mode: () => 'system', load: async () => ({ model: 'M3' }), unload }) // «Только системное»: прогрев не греет — модель на одну разметку
    expect(sys.model).toBe('M3'); sys.release(); expect(unload).toHaveBeenCalledWith('M3')
  })
})
