// Читка-караоке (CONCEPT_REHEARSAL.md §3, акт «Читка», v3.3.87): подписи кусков над дорожками заливаются зелёным в такт голосу Пита, впереди идёт курсор «|». Здесь — чистая математика без React и DOM
// (проверяется тестами); рисует её ReadKaraoke.jsx через useReadKaraoke.js. Все времена — мс от старта стадии.
//  • план (karaokePlan): слова фразы по кускам стадии (stage.metro — [{ chunk, at, ms }]) с временами from / to. Тайминги слов внутри куска озвучки библиотеки неизвестны (у куска один файл), поэтому длина куска делится между его
//    словами по числу букв (длинное слово звучит дольше); между кусками — пауза (до следующего куска) и список отрезков segs: { kind: 'word' | 'gap', word, from, to } — слово заливается, либо курсор идёт к следующему слову;
//  • кадр (karaokeFrame): в момент t — заливка каждого слова 0..1 и курсор { word, f, next, nf, q, bar, dot }: стоит в слове word на доле f его ширины (идёт к слову next, где голос на доле nf, на доле пути q), bar — высота «|» 0..1, dot — размер кружка 0..1.
//    Курсор: перед первым словом «|» вырастает из 0 за GROW_MS и идёт по слову, пока оно звучит; после слова сжимается в кружок за SHRINK_MS, кружок плывёт к следующему слову на длину паузы и вырастает в «|» за GROW_MS; после последнего
//    слова «|» уходит в 0. Пауза между кусками у диктора короткая (PIECE_PAD_MS ≈ 80 мс), и превращение «|» → кружок → «|» в неё не уместилось бы: прыжок длится не меньше MIN_HOP_MS, недостающее делится пополам и заходит в концовку
//    слова и в начало следующего (не больше 40 % каждого: слово остаётся залитым по своему времени, а курсор уже в пути); отдых «|» у слова — с rest;
//  • игрок (chase, heardWords): время игрока — не часы, а «догоняющий» счётчик. Слов услышано heard (по недосказанной цели слушателя — tail.tokens, и по готовой — seq), курсор ждёт у следующего слова, идёт в него, пока слышна речь
//    (до SPEAK_REACH доли слова — дальше пустит только распознанное слово), и ускоренно догоняет уже распознанное. Времена слов игрока — те же, что у Пита (ожидаемый темп по длинам кусков).
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'

export const GROW_MS = 160        // «|» вырастает из нуля
export const SHRINK_MS = 160      // «|» сжимается в кружок (и в ноль в конце)
export const MIN_HOP_MS = 240     // прыжок «|» → кружок → «|» между словами не короче (короткая пауза растягивается на соседние слова)
export const SPEAK_REACH = 0.8    // пока слышна речь, курсор заходит в следующее слово не дальше этой доли
export const CATCH_UP = 1.8       // во сколько раз быстрее времени идёт курсор, догоняя уже распознанное слово
export const SPEAKING_MS = 700    // речь «слышна», если распознаватель что-то слышал не дольше стольких мс назад

export const splitWords = text => String(text ?? '').split(/\s+/).filter(Boolean)
const weight = w => Math.max(1, String(w).replace(/[^\p{L}\p{N}]/gu, '').length)
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = q => q * q * (3 - 2 * q) // плавный старт и остановка курсора между словами

/** metro — stage.metro; chunks — тексты кусков. → { words: [{ i, chunk, w, text, from, to, tokens }], segs, end } (пусто, если metro пуст) */
export function karaokePlan(metro, chunks) {
  const words = []
  for (const m of metro ?? []) {
    const list = splitWords(chunks?.[m.chunk])
    const total = list.reduce((a, t) => a + weight(t), 0)
    let acc = 0
    list.forEach((text, w) => {
      const from = m.at + (m.ms * acc) / total
      acc += weight(text)
      words.push({ i: words.length, chunk: m.chunk, w, text, from: Math.round(from), to: Math.round(m.at + (m.ms * acc) / total), tokens: Math.max(1, tokenize(text).length) })
    })
  }
  const segs = []
  words.forEach((x, i) => {
    segs.push({ kind: 'word', word: i, from: x.from, to: x.to })
    const nx = words[i + 1]
    if (nx && nx.from > x.to) {
      const g = nx.from - x.to, extra = Math.max(0, MIN_HOP_MS - g)
      const a = Math.min(extra / 2, 0.4 * (x.to - x.from)), b = Math.min(extra / 2, 0.4 * (nx.to - nx.from))
      segs.push({ kind: 'gap', word: i, from: x.to, to: nx.from, h0: x.to - a, h1: nx.from + b })
      nx.rest = nx.from + b // с этого момента «|» у слова уже полностью вырос
    }
  })
  if (words[0]) words[0].rest = words[0].from
  words.forEach(x => { x.rest ??= x.from }) // слово сразу после слова (внутри куска) — «|» просто идёт дальше
  return { words, segs, end: words.at(-1)?.to ?? 0 }
}

/** Курсор в момент t: null — не виден */
function cursorAt(plan, t) {
  const { words, segs, end } = plan
  const first = words[0]
  if (t < first.from - GROW_MS) return null
  if (t < first.from) return { word: 0, f: 0, next: null, q: 0, bar: (t - (first.from - GROW_MS)) / GROW_MS, dot: 0 }
  if (t >= end) return t < end + SHRINK_MS ? { word: words.length - 1, f: 1, next: null, q: 0, bar: 1 - (t - end) / SHRINK_MS, dot: 0 } : null
  const hop = segs.find(x => x.kind === 'gap' && t >= x.h0 && t < x.h1) // прыжок между словами идёт в окне паузы (оно может заходить в соседние слова)
  if (hop) {
    const w = hop.h1 - hop.h0, d = t - hop.h0
    const sh = Math.min(SHRINK_MS, w * 0.3), gr = Math.min(GROW_MS, w * 0.3)
    const a = words[hop.word], b = words[hop.word + 1]
    const fa = clamp01((t - a.from) / Math.max(1, a.to - a.from)), fb = clamp01((t - b.from) / Math.max(1, b.to - b.from)) // где сейчас голос в слове: курсор не отстаёт и не убегает
    if (d < sh) return { word: hop.word, f: fa, next: null, nf: 0, q: 0, bar: 1 - d / sh, dot: d / sh }
    if (d >= w - gr) { const k = (d - (w - gr)) / gr; return { word: hop.word + 1, f: fb, next: null, nf: 0, q: 0, bar: k, dot: 1 - k } }
    return { word: hop.word, f: fa, next: hop.word + 1, nf: fb, q: ease((d - sh) / (w - sh - gr)), bar: 0, dot: 1 }
  }
  const s = segs.find(x => x.kind === 'word' && t >= x.from && t < x.to)
  if (!s) return null
  return { word: s.word, f: clamp01((t - s.from) / Math.max(1, s.to - s.from)), next: null, q: 0, bar: 1, dot: 0 }
}

/** Кадр в момент t: { fills: number[] (заливка слов 0..1), cursor } */
export function karaokeFrame(plan, t) {
  if (!plan.words.length) return { fills: [], cursor: null }
  return { fills: plan.words.map(x => clamp01((t - x.from) / Math.max(1, x.to - x.from))), cursor: cursorAt(plan, t) }
}

/** Сколько слов с начала фразы уже сказано: tokens — слов (по tokenize) недосказанной цели слушателя, done — цель сказана целиком */
export function heardWords(plan, { tokens = 0, done = false } = {}) {
  if (done) return plan.words.length
  let acc = 0, n = 0
  for (const x of plan.words) { acc += x.tokens; if (acc > tokens) break; n += 1 }
  return n
}

/** Время игрока с начала стадии: с первого слова. Шаг на dt мс: идёт вперёд, пока слышна речь или слово ещё надо догнать, но не дальше предела; назад не бывает */
export function startTime(plan) { return plan.words[0]?.from ?? 0 }
export function chase(plan, tv, dt, { heard = 0, speaking = false } = {}) {
  const { words, end } = plan
  if (!words.length) return tv
  const n = words.length
  let limit
  if (heard >= n) limit = end + SHRINK_MS
  else { const nx = words[heard]; limit = speaking ? Math.max(nx.rest, nx.from + SPEAK_REACH * (nx.to - nx.from)) : nx.rest }
  const behind = heard > 0 && tv < words[Math.min(heard, n) - 1].to // слово распознано, а заливка до его конца не дошла
  const next = tv + dt * (behind ? CATCH_UP : 1)
  return Math.max(tv, Math.min(next, limit))
}
