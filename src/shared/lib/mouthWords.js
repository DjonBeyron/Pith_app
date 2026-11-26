// Тайминги слов озвучки для рта (владелец 2026-11-26: «после „переозвучить с интонацией“ рот перестал попадать в звук»). Чистые функции без React и без звука.
// С v3.3.369 диктору уходит текст СО ЗНАКАМИ («Не получается… Коробка тяжёлая.»): ElevenLabs делает после знака паузу, а в посимвольной разметке время этой паузы числится за самим знаком.
// Прежняя сборка слов (edge-функция tts-elevenlabs) кончала слово на последнем символе куска «получается…» — то есть на конце паузы: рот растягивал буквы слова на слово + тишину и «говорил» в паузе.
//  • wordsFromAlignment — эталон сборки слов: слово идёт от первой до последней БУКВЫ / ЦИФРЫ куска, знаки по краям времени слову не дают; кусок из одних знаков («—») словом не считается.
//    Тот же алгоритм стоит в edge-функции (supabase/functions/tts-elevenlabs/index.ts) — сторож mouthWords.test.js исполняет её код и сверяет с этим.
//  • tidyWords — починка УЖЕ СОХРАНЁННЫХ записей без переозвучки: у слова со знаком в конце («тяжёлая.») конец подрезается до правдоподобной длины слова по темпу остальных слов реплики
//    (слова без знака; мало таких — темп по умолчанию). Слово без знака и слово, которое и так не длиннее потолка, не трогается — на правильной разметке функция ничего не меняет.
//  • wordsHealth — «плохая разметка» для «Проверки» сценария: число слов не то, времена не по порядку, разметка длиннее файла.
import { LETTER } from './visemeLetters.js'

const CORE = /[\p{L}\p{N}]/u
const TAIL_SIGN = /[^\p{L}\p{N}]+$/u
export const RATE_DEF = 0.07                   // секунд на букву: ≈ 14 знаков в секунду (озвучка владельца — 12,6–16,6 знака/с, timeline/check/lineCheck.js)
export const RATE_MIN = 0.045, RATE_MAX = 0.11
export const STRETCH = 1.2                     // слово перед паузой тянется (конец фразы), но не длиннее темпа × столько
export const MIN_WORD_S = 0.3                  // короткое слово («я», «тут») не подрезается короче этого
const r3 = v => Math.round(v * 1000) / 1000

/** Посимвольная разметка ElevenLabs { characters, character_start_times_seconds, character_end_times_seconds } → слова [{ w, t, e }] (секунды, до сотых) */
export function wordsFromAlignment(alignment) {
  const chars = alignment?.characters ?? [], starts = alignment?.character_start_times_seconds ?? [], ends = alignment?.character_end_times_seconds
  const r = v => Math.round(v * 100) / 100
  const out = []
  let word = '', from = null, to = 0
  const push = () => { if (word && from != null) out.push({ w: word, t: r(from), e: r(to) }); word = ''; from = null }
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (/\s/.test(ch)) { push(); continue }
    word += ch
    if (!CORE.test(ch)) continue
    if (from == null) from = starts[i]
    to = ends?.[i] ?? starts[i]
  }
  push()
  return out
}

const endOf = x => (Number.isFinite(x?.e) && x.e > x.t ? x.e : null)
const signed = x => TAIL_SIGN.test(String(x?.w ?? ''))
const letters = x => [...String(x?.w ?? '')].filter(ch => CORE.test(ch)).length
const cap = (x, rate) => Math.max(MIN_WORD_S, letters(x) * rate * STRETCH)

/** Темп речи реплики: медиана «секунд на букву» по словам без знака в конце; таких меньше двух — RATE_DEF */
export function speechRate(words) {
  const list = (words ?? []).filter(x => x && !signed(x) && endOf(x) != null && letters(x) > 0).map(x => (x.e - x.t) / letters(x)).sort((a, b) => a - b)
  if (list.length < 2) return RATE_DEF
  return Math.min(RATE_MAX, Math.max(RATE_MIN, list[Math.floor(list.length / 2)]))
}

/** Слова для рта: у слова со знаком в конце пауза после знака из слова вырезана; конец слова не заходит за начало следующего. Число и порядок слов не меняются */
export function tidyWords(words) {
  if (!Array.isArray(words) || !words.length) return words
  const rate = speechRate(words)
  return words.map((x, i) => {
    const e = endOf(x)
    if (e == null) return x
    const next = words[i + 1]?.t
    let to = signed(x) ? Math.min(e, x.t + cap(x, rate)) : e
    if (Number.isFinite(next) && next > x.t) to = Math.min(to, next)
    return to < e ? { ...x, e: r3(to) } : x
  })
}

/** Сколько секунд пауз было записано внутрь слов (tidyWords их вырезал) — для отчёта и тестов */
export const stretchedS = words => (Array.isArray(words) ? r3(tidyWords(words).reduce((a, x, i) => a + ((endOf(words[i]) ?? 0) - (endOf(x) ?? 0)), 0)) : 0)

const s1 = v => `${(Math.round(v * 10) / 10).toFixed(1).replace('.', ',')} с`
/** Плохая разметка рта → [{ k: 'count' | 'order' | 'beyond', text }] (пусто — годится); text — чистый текст реплики, dur — длительность файла (с) */
export function wordsHealth(text, words, dur = null) {
  if (!Array.isArray(words) || !words.length) return []
  const out = []
  const want = String(text ?? '').split(/\s+/).filter(w => LETTER.test(w)).length
  const got = words.filter(x => LETTER.test(String(x?.w ?? 'a'))).length
  if (want && got !== want) out.push({ k: 'count', text: `в разметке рта ${got} сл., а в тексте ${want} — рот идёт по тексту равномерно и не попадает в паузы` })
  if (words.some((x, i) => !Number.isFinite(x?.t) || (i > 0 && x.t < words[i - 1]?.t))) out.push({ k: 'order', text: 'в разметке рта времена слов идут не по порядку' })
  const last = endOf(words.at(-1)) ?? Number(words.at(-1)?.t)
  if (dur > 0 && last > dur * 1.05) out.push({ k: 'beyond', text: `разметка рта кончается на ${s1(last)}, а файл длится ${s1(dur)} — она от другого файла` })
  return out
}
