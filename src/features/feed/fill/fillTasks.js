import { pickConfusers } from './pickConfusers.js'
import { planFillAudio } from './fillAudioPlan.js'

// Выбор задачи для игры «Дополни реплику» (B5). Источник — те же колоды повторения, что у «Выбери слово»
// (reviewDecks.buildDecks): в карточках слова есть озвученные реплики двух видов —
//   · нода `audio` (голосовое): typeData.audio { text, r2Url, wordTimings: [{ w, t, e? }] } — слово, секунда начала/конца;
//   · нода `scene` (сцена): typeData.scene.scene.timeline[] — реплика { text, audioUrl, wordTimings: [{ word, start, end }] }.
// Берём реплику, где встречается слово колоды; на его месте — «мяу», вариантов три (верное + два двойника, pickConfusers).
// Нет файла или таймингов слова — реплика остаётся только текстом (task.audio = null), «мяу» — надписью.
// Чистые функции, без сети и React.
const MAX_LINE = 140 // символов: реплика для игры на минутку — короткая
const MIN_TOKENS = 3
const MAX_TOKENS = 20
const TOKEN_RE = /[A-Za-z][A-Za-z'’-]*/g
const SINGLE_WORD = /^[a-z][a-z'-]{1,}$/

const num = v => typeof v === 'number' && Number.isFinite(v)
const norm = w => String(w ?? '').toLowerCase().replace(/[’‘`´]/g, "'").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')

// Слова строки с позициями: [{ raw, norm, index }]
export function tokensOf(text) {
  return [...String(text ?? '').matchAll(TOKEN_RE)].map(m => ({ raw: m[0], norm: norm(m[0]), index: m.index }))
}

// Тайминги слов к общему виду [{ word, start, end|null }] (голосовое: { w, t, e }; сцена: { word, start, end })
function timingsOf(raw) {
  if (!Array.isArray(raw)) return []
  const out = raw.map(x => ({ word: norm(x?.w ?? x?.word), start: x?.t ?? x?.start, end: x?.e ?? x?.end }))
    .filter(x => x.word && num(x.start))
  return out.map((x, i) => ({ ...x, end: num(x.end) ? x.end : null, nextStart: out[i + 1]?.start ?? null }))
}

// Озвученные реплики карточки: [{ text, audioUrl | null, timings }]. Шаблоны сцен (segments, {переменные}) пропускаем
export function cardLines(card) {
  const out = []
  for (const n of card?.nodes ?? []) {
    if (n.type === 'audio') {
      const d = n.typeData?.audio
      if (typeof d?.text === 'string' && d.text.trim()) out.push({ text: d.text.trim(), audioUrl: d.r2Url ?? null, timings: timingsOf(d.wordTimings) })
    } else if (n.type === 'scene') {
      for (const l of n.typeData?.scene?.scene?.timeline ?? []) {
        if (typeof l?.text !== 'string' || !l.text.trim() || (l.segments?.length) || /[{}]/.test(l.text)) continue
        out.push({ text: l.text.trim(), audioUrl: l.audioUrl ?? null, timings: timingsOf(l.wordTimings) })
      }
    }
  }
  return out.filter(l => l.text.length <= MAX_LINE)
}

// Где в реплике слово → { token, k } (k — какое по счёту вхождение этого слова) | null; реплика должна быть фразой
export function findWord(line, word) {
  const toks = tokensOf(line.text)
  if (toks.length < MIN_TOKENS || toks.length > MAX_TOKENS) return null
  const at = toks.findIndex(t => t.norm === word)
  if (at < 0) return null
  return { token: toks[at], k: toks.slice(0, at).filter(t => t.norm === word).length, tokens: toks }
}

// Расписание звука для слова реплики (fillAudioPlan) или null — нет файла/таймингов именно этого вхождения
export function audioFor(line, word, k) {
  if (!line.audioUrl || !/^https?:\/\//.test(line.audioUrl)) return null
  const t = line.timings.filter(x => x.word === word)[k]
  const plan = t && planFillAudio({ start: t.start, end: t.end, nextStart: t.nextStart })
  return plan ? { url: line.audioUrl, steps: plan.steps } : null
}

// Регистр варианта — как у слова в реплике («Keep» в начале → «Ship»)
const caseLike = (raw, w) => (raw[0] !== raw[0].toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w)

function shuffle(list, rand) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Задача из реплики: { text, before, after, answer, options: [3 слова], audio } | null (двойников набралось меньше двух)
function buildTask(line, hit, word, pool, rand) {
  const wrong = pickConfusers(word, pool, { rand })
  if (wrong.length < 2) return null
  const { token } = hit
  const answer = token.raw
  return {
    text: line.text,
    before: line.text.slice(0, token.index),
    after: line.text.slice(token.index + answer.length),
    answer,
    options: shuffle([answer, ...wrong.map(w => caseLike(answer, w))], rand),
    audio: audioFor(line, word, hit.k),
  }
}

// Реплики слова с местом слова: [{ line, hit }]
function hitsOf(deck, word) {
  const out = []
  for (const card of deck?.cards ?? []) {
    for (const line of cardLines(card)) {
      const hit = findWord(line, word)
      if (hit) out.push({ line, hit })
    }
  }
  return out
}

// decks: Map(слово → { modules, cards }) (reviewDecks.buildDecks); exclude — слова, которые уже предлагали;
// inMemory — слова в памяти; sound — звук включён (звучащая реплика в приоритете). Слова не из памяти — раньше.
// → { word, moduleId, task } | null
export function pickFillTask(decks, { exclude = [], inMemory = new Set(), sound = true, rand = Math.random } = {}) {
  const skip = new Set(exclude)
  const fresh = []
  const known = []
  const all = [...(decks ?? []).keys()]
  for (const [word, deck] of decks ?? []) {
    if (skip.has(word) || !SINGLE_WORD.test(word) || word.length < 3) continue
    const hits = hitsOf(deck, word)
    if (hits.length) (inMemory.has(word) ? known : fresh).push({ word, deck, hits })
  }
  for (const list of [shuffle(fresh, rand), shuffle(known, rand)]) {
    for (const { word, deck, hits } of list) {
      const voiced = hits.filter(h => audioFor(h.line, word, h.hit.k))
      for (const h of shuffle(sound && voiced.length ? voiced : hits, rand)) {
        const pool = [...all, ...h.hit.tokens.map(t => t.norm)]
        const task = buildTask(h.line, h.hit, word, pool, rand)
        if (task) return { word, moduleId: deck.modules?.[0]?.id ?? null, task }
      }
    }
  }
  return null
}

// Открытая игра из выбора (feedGame: kind.build): звука нет — реплика только текстом
export const openFill = (pick, { sound }) => ({ task: sound ? pick.task : { ...pick.task, audio: null } })
