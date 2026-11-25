import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { wordsFromAlignment, tidyWords, stretchedS, speechRate, wordsHealth, RATE_DEF } from './mouthWords.js'
import { fakeAlignment, oldWordsFromAlignment, voicedAt, DEMO_TTS, DEMO_TEXT } from './mouthWordsFixture.js'
import { mouthTrack, codeAt } from '../../features/player/modules/rotate-phone/wordLaneVisemes.js'
import { ttsProblem } from '../../features/rehearsal/tts/ttsText.js'

// Рот после «переозвучить с интонацией» (владелец 2026-11-26): диктору ушёл текст со знаками, ElevenLabs сделал паузы после знаков. Подставной ответ ElevenLabs — mouthWordsFixture.js (сервис не вызывается, звук не декодируется).
const al = fakeAlignment(DEMO_TTS), total = al.character_end_times_seconds.at(-1), ms = Math.round(total * 1000)
/** Доля времени (0…1), где рот открыт, а голоса нет, и где голос есть, а рот закрыт — шаг 10 мс */
function miss(track) {
  let open = 0, shut = 0, n = 0
  for (let t = 5; t < ms; t += 10, n++) { const v = voicedAt(al, t / 1000), m = codeAt(track, t) !== 'X'; if (m && !v) open++; if (!m && v) shut++ }
  return { open: open / n, shut: shut / n }
}
/** Код edge-функции как есть: текст функции из index.ts без типов → исполняемая функция */
function edgeFn() {
  const src = readFileSync('supabase/functions/tts-elevenlabs/index.ts', 'utf8')
  const from = src.indexOf('function wordTimingsFromAlignment'), to = src.indexOf('\n}\n', from) + 3
  return new Function(`${stripTypeScriptTypes(src.slice(from, to))}; return wordTimingsFromAlignment`)()
}

describe('слова озвучки для рта', () => {
  it('текст для диктора отличается от текста реплики только знаками: число слов то же', () => {
    expect(ttsProblem(DEMO_TEXT, DEMO_TTS)).toBeNull()
    expect(wordsFromAlignment(al).map(x => x.w)).toEqual(['Не', 'получается…', 'Коробка', 'тяжёлая.', 'Помоги', 'её', 'приподнять!'])
  })
  it('прежняя сборка слов записывала паузу после знака в слово, новая — нет', () => {
    const old = oldWordsFromAlignment(al), now = wordsFromAlignment(al)
    expect(old.map(x => x.t)).toEqual(now.map(x => x.t))                 // начала слов не менялись
    expect(old[1].e - now[1].e).toBeCloseTo(0.6, 2)                      // «получается…»: 0,6 с паузы были внутри слова
    expect(old[3].e - now[3].e).toBeCloseTo(0.5, 2)                      // «тяжёлая.»
    expect(old[6].e - now[6].e).toBeCloseTo(0.3, 2)                      // «приподнять!» — хвост файла
    expect(now[0].e).toBe(old[0].e)                                      // слово без знака — как было
  })
  it('edge-функция tts-elevenlabs собирает слова тем же алгоритмом (исполняется её код)', () => {
    const edge = edgeFn()
    for (const text of [DEMO_TTS, 'Эй, ты куда?! Так и оставишь меня в коробке?', 'Зелёная зона: знаете. Слово в памяти надёжно.', 'Кое-кто — «ответит» верно…\nТри раза подряд.', '— Ну… 5 раз!', 'Как носитель… ну, почти!'])
      expect(edge(fakeAlignment(text, { lead: 0.12 }))).toEqual(wordsFromAlignment(fakeAlignment(text, { lead: 0.12 })))
    expect(edge(fakeAlignment('Кое-кто — «ответит» верно…')).map(x => x.w)).toEqual(['Кое-кто', '«ответит»', 'верно…']) // тире отдельным куском — не слово; дефис внутри слова остаётся
    expect(edge({ characters: ['a', 'b'], character_start_times_seconds: [0, 0.1] })).toEqual([{ w: 'ab', t: 0, e: 0.1 }]) // концов символов нет — конец слова по началу последнего, как раньше
  })
  it('рот: по новым словам молчит в паузах; по прежним (уже сохранённым) — тоже, после починки tidyWords; равномерно по тексту — идёт мимо', () => {
    const now = miss(mouthTrack(DEMO_TEXT, ms, wordsFromAlignment(al), total))
    const saved = miss(mouthTrack(DEMO_TEXT, ms, oldWordsFromAlignment(al), total))
    const even = miss(mouthTrack(DEMO_TEXT, ms))                          // так шёл рот Мии: слова по тексту на всю длину файла
    expect(now.open).toBeLessThan(0.03); expect(now.shut).toBeLessThan(0.1)
    expect(saved.open).toBeLessThan(0.12); expect(saved.shut).toBeLessThan(0.12) // починка приблизительная (конец слова — по темпу реплики): остаток — доли секунды у знака, точная разметка — после переозвучки
    expect(even.open).toBeGreaterThan(0.2)                                // рот открыт больше чем пятую часть реплики, пока в звуке тишина
    expect(stretchedS(oldWordsFromAlignment(al))).toBeGreaterThan(1)      // в прежней разметке больше секунды пауз сидело внутри слов
  })
  it('на правильной разметке починка ничего не меняет; число и порядок слов не меняются никогда', () => {
    const now = wordsFromAlignment(al)
    expect(tidyWords(now)).toEqual(now); expect(stretchedS(now)).toBe(0)
    const old = oldWordsFromAlignment(al), fixed = tidyWords(old)
    expect(fixed.map(x => [x.w, x.t])).toEqual(old.map(x => [x.w, x.t]))
    fixed.forEach((x, i) => { expect(x.e).toBeGreaterThan(x.t); if (fixed[i + 1]) expect(x.e).toBeLessThanOrEqual(fixed[i + 1].t) })
    expect(tidyWords(null)).toBeNull(); expect(tidyWords([])).toEqual([])
    expect(tidyWords([{ w: 'hello', t: 0.5 }, { w: 'world.', t: 1.1, e: 1.2 }])).toEqual([{ w: 'hello', t: 0.5 }, { w: 'world.', t: 1.1, e: 1.2 }]) // конца нет / слово и так короткое — не трогаем
  })
  it('темп речи: по словам без знака; мало таких — по умолчанию', () => {
    expect(speechRate([{ w: 'Мимо.', t: 0, e: 1 }])).toBe(RATE_DEF)
    expect(speechRate(oldWordsFromAlignment(al))).toBeCloseTo(0.07, 2)
  })
  it('плохая разметка: число слов, порядок времён, разметка длиннее файла', () => {
    const now = wordsFromAlignment(al)
    expect(wordsHealth(DEMO_TEXT, now, total)).toEqual([])
    expect(wordsHealth(DEMO_TEXT, now.slice(1), total).map(x => x.k)).toEqual(['count'])
    expect(wordsHealth('a b', [{ w: 'a', t: 1, e: 1.2 }, { w: 'b', t: 0.5, e: 0.7 }], 2).map(x => x.k)).toEqual(['order'])
    expect(wordsHealth('a b', [{ w: 'a', t: 0, e: 0.2 }, { w: 'b', t: 0.5, e: 3 }], 2).map(x => x.k)).toEqual(['beyond'])
    expect(wordsHealth(DEMO_TEXT, null, total)).toEqual([])
  })
})
