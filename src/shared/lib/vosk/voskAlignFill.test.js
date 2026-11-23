import { describe, it, expect } from 'vitest'
import { rmsLevels, voiceSpans, fillWords, checkWords, repairCs, alignInfo, alignLine, MIN_WORD_CS } from './voskAlignFill.js'
import { alignTokens } from './voskAlignText.js'

// Разметка рта своего файла: голосовые участки по громкости и достройка слов, которые Vosk не нашёл. Главное — гарантии итога.
const RATE = 16000
/** Запись: [секунды, громкость] подряд → сэмплы (тон 220 Гц нужной амплитуды) */
const pcm = (...parts) => {
  const out = []
  for (const [sec, amp] of parts) for (let i = 0, n = Math.round(sec * RATE); i < n; i++) out.push(amp * Math.sin((i * 2 * Math.PI * 220) / RATE))
  return Float32Array.from(out)
}
const spansOf = samples => { const { levels, step } = rmsLevels(samples, RATE); return voiceSpans(levels, step) }
const near = (a, b, d = 0.04) => Math.abs(a - b) <= d
const tok = text => alignTokens(text)
const ok = (words, dur, n) => expect(checkWords(words, dur, n)).toEqual([])

describe('голосовые участки по громкости', () => {
  it('тишина — голос — пауза — голос — тишина: два участка с верными границами', () => {
    const s = spansOf(pcm([0.4, 0.0005], [0.8, 0.2], [0.5, 0.0005], [0.6, 0.15], [0.3, 0.0005]))
    expect(s).toHaveLength(2)
    expect(near(s[0].from, 0.4) && near(s[0].to, 1.2) && near(s[1].from, 1.7) && near(s[1].to, 2.3)).toBe(true)
  })
  it('короткий провал (смычка согласной) не делит участок, щелчок участком не считается', () => {
    expect(spansOf(pcm([0.3, 0], [0.4, 0.2], [0.08, 0], [0.4, 0.2], [0.3, 0]))).toHaveLength(1)
    expect(spansOf(pcm([0.5, 0], [0.02, 0.3], [0.5, 0], [0.5, 0.2]))).toHaveLength(1)
  })
  it('тишина, очень тихая запись и ровный гул — участков нет', () => {
    expect(spansOf(pcm([2, 0]))).toEqual([]); expect(spansOf(pcm([2, 0.0008]))).toEqual([]); expect(spansOf(pcm([2, 0.2]))).toEqual([])
    expect(voiceSpans(new Float32Array(0), 0.02)).toEqual([])
  })
})

describe('достройка ненайденных слов', () => {
  it('всё найдено — времена Vosk как есть (сотые секунды), метод vosk', () => {
    const r = fillWords(tok('Теперь твоя очередь'), [{ t: 0.21, e: 0.6 }, { t: 0.63, e: 0.9 }, { t: 0.9, e: 1.5 }], [{ from: 0.2, to: 1.5 }], 2)
    expect(r.method).toBe('vosk')
    expect(r.words).toEqual([{ w: 'Теперь', t: 0.21, e: 0.6, a: 'v' }, { w: 'твоя', t: 0.63, e: 0.9, a: 'v' }, { w: 'очередь', t: 0.9, e: 1.5, a: 'v' }])
  })
  it('между соседями: два слова делят промежуток пропорционально длине слова', () => {
    const r = fillWords(tok('Ничего я попробуем раз'), [{ t: 0.2, e: 0.6 }, null, null, { t: 2.0, e: 2.4 }], [{ from: 0.2, to: 2.4 }], 3)
    expect(r.method).toBe('vosk+fill'); ok(r.words, 3, 4)
    const [, a, b] = r.words
    expect(a.a).toBe('f'); expect(a.t).toBeGreaterThanOrEqual(0.6); expect(b.e).toBeLessThanOrEqual(2.0)
    expect(b.e - b.t).toBeGreaterThan((a.e - a.t) * 2) // «попробуем» намного длиннее «я»
  })
  it('пауза в записи внутри промежутка остаётся паузой рта: слова ложатся только на голос', () => {
    const spans = [{ from: 0.2, to: 1.0 }, { from: 1.8, to: 3.0 }]
    const r = fillWords(tok('раз потом выбери дорожку'), [{ t: 0.2, e: 0.6 }, null, null, { t: 2.5, e: 3.0 }], spans, 3.2)
    ok(r.words, 3.2, 4)
    for (const w of r.words.slice(1, 3)) expect(w.e <= 1.0 + 1e-9 || w.t >= 1.8 - 1e-9, `${w.w} ${w.t}-${w.e}`).toBe(true)
  })
  it('в начале и в конце — в пределах голоса записи, а не от нуля и не до конца файла', () => {
    const r = fillWords(tok('Ну теперь твоя очередь давай'), [null, { t: 1.0, e: 1.4 }, { t: 1.4, e: 1.8 }, { t: 1.8, e: 2.4 }, null], [{ from: 0.7, to: 3.0 }], 4)
    ok(r.words, 4, 5)
    expect(r.words[0].t).toBeGreaterThanOrEqual(0.7); expect(r.words[0].e).toBeLessThanOrEqual(1.0)
    expect(r.words[4].t).toBeGreaterThanOrEqual(2.4); expect(r.words[4].e).toBeLessThanOrEqual(3.0)
  })
  it('места между соседями нет, а сосед растянут — пропущенное слово занимает его лишнее; сосед обычной длины не трогается', () => {
    const long = fillWords(tok('да нет да да'), [{ t: 0.2, e: 0.5 }, null, { t: 0.5, e: 1.4 }, { t: 1.4, e: 1.7 }], [{ from: 0.2, to: 1.7 }], 2)
    ok(long.words, 2, 4); expect(long.words[1].e - long.words[1].t).toBeGreaterThan(0.15)
    const tight = fillWords(tok('да нет да да'), [{ t: 0.2, e: 0.5 }, null, { t: 0.5, e: 0.8 }, { t: 0.8, e: 1.1 }], [{ from: 0.2, to: 1.1 }], 2)
    ok(tight.words, 2, 4); expect(tight.words[1].e - tight.words[1].t).toBeLessThan(0.08); expect(tight.words[0]).toMatchObject({ t: 0.2, a: 'v' })
  })
  it('Vosk не нашёл ничего — слова по голосовым участкам (level): пауза записи = пауза рта', () => {
    const spans = [{ from: 0.5, to: 1.5 }, { from: 2.5, to: 3.5 }]
    const r = fillWords(tok('один два три четыре'), [null, null, null, null], spans, 4)
    expect(r.method).toBe('level'); ok(r.words, 4, 4); expect(r.words.every(w => w.a === 'l')).toBe(true)
    expect(r.words[0].t).toBeGreaterThanOrEqual(0.5); expect(r.words.at(-1).e).toBeLessThanOrEqual(3.5)
    for (const w of r.words) expect(w.e <= 1.5 + 1e-9 || w.t >= 2.5 - 1e-9).toBe(true)
  })
  it('нет ни слов Vosk, ни голосовых участков — равномерно на всю длину (even)', () => {
    const r = fillWords(tok('один два три'), null, [], 3)
    expect(r.method).toBe('even'); ok(r.words, 3, 3); expect(r.words[0].t).toBe(0); expect(r.words.at(-1).e).toBeGreaterThan(2.5)
  })
  it('гарантии держатся на плохом входе: времена за файлом, наложения, обратный порядок, нулевая длина, очень короткий файл', () => {
    const cases = [
      [tok('а б в г'), [{ t: 3, e: 9 }, { t: 1, e: 2 }, { t: 1.5, e: 1.5 }, { t: -1, e: 0.2 }], [{ from: 0, to: 2 }], 2],
      [tok('а б в г д е'), [{ t: 0.1, e: 1.9 }, null, null, null, null, { t: 1.9, e: 2 }], [], 2],
      [tok('раз два три четыре пять'), [null, null, null, null, null], [{ from: 0.01, to: 0.05 }], 0.3],
      [tok('раз два три четыре пять шесть семь восемь девять десять'), null, [], 0.2],
      [tok('слово'), [{ t: NaN, e: 1 }], [{ from: 5, to: 6 }], 1],
    ]
    for (const [t, times, spans, dur] of cases) ok(fillWords(t, times, spans, dur).words, dur, t.length)
  })
  it('сотые секунды: без наложений, слово не короче наименьшей длины, всё внутри файла', () => {
    const r = repairCs([{ t: 10, e: 10 }, { t: 5, e: 30 }, { t: 400, e: 900 }], 200)
    expect(r.every((x, i) => x.e - x.t >= MIN_WORD_CS && x.e <= 200 && (!i || x.t >= r[i - 1].e))).toBe(true)
  })
})

describe('статус разметки по самим таймингам реплики', () => {
  it('озвучка ElevenLabs (меток нет), свой файл (метки есть), таймингов нет', () => {
    expect(alignInfo(null)).toMatchObject({ has: false }); expect(alignLine(alignInfo(null))).toBe('разметки рта нет')
    expect(alignLine(alignInfo([{ w: 'Отлично!', t: 0.1, e: 0.6 }]))).toBe('рот размечен (озвучка ElevenLabs)')
    const all = [{ w: 'Раз', t: 0, e: 1, a: 'v' }, { w: 'два', t: 1, e: 2, a: 'v' }]
    expect(alignInfo(all)).toMatchObject({ own: true, found: 2, total: 2, method: 'vosk', approx: false }); expect(alignLine(alignInfo(all))).toBe('рот размечен: 2 слов из 2 (Vosk)')
  })
  it('частично: «найдено N из M … (не найдены: …)», меньше 60 % — «приблизительно»; ничего — «по громкости записи»', () => {
    const w = (a, word = 'слово') => ({ w: word, t: 0, e: 1, a })
    expect(alignLine(alignInfo([w('v'), w('v'), w('f', 'okay?')]))).toBe('рот размечен: найдено 2 из 3, остальные расставлены по записи (не найдены: «okay?»)')
    expect(alignLine(alignInfo([w('v'), w('f', 'б'), w('f', 'в')]))).toBe('рот размечен приблизительно: найдено 1 из 3, остальные расставлены по записи (не найдены: «б», «в»)')
    expect(alignLine(alignInfo([w('l'), w('l')]))).toBe('рот по громкости записи: Vosk не узнал слова')
  })
})
