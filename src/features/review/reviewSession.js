import { reviewOutcome } from '../../shared/lib/memory/reviewOutcome.js'

// Сессия повторения дня (этап 4 системы повторения, PROJECT.md → «Формат
// повторения»). Чистая логика без сети и интерфейса:
//   buildSession — из выбора дня (pickToday) и колод собрать очередь карточек
//     вперемешку, с ротацией (не та карточка, что показывали в прошлый раз);
//   answerCard   — ответ на текущую карточку: ошибка возвращает слово в конец
//     очереди ОДИН раз (лучше другой карточкой того же слова), вторая ошибка —
//     показать ответ и идти дальше;
//   wordOutcomes — исход каждого слова за сессию (reviewOutcome.js).
// Сессия длиннее плана максимум на число ошибок.

// Карточки со звуком/голосом — их убирает «Не могу слушать»
const AUDIO_TYPES = new Set(['audio', 'voice_record', 'circle', 'video'])
export const cardHasAudio = card => (card?.nodes ?? []).some(n => AUDIO_TYPES.has(n.type))

// Карточки слова начиная со следующей после показанной в прошлый раз
function rotate(cards, lastCardId) {
  const i = cards.findIndex(c => c.id === lastCardId)
  return i < 0 ? cards : [...cards.slice(i + 1), ...cards.slice(0, i + 1)]
}

// Вперемешку: слова в случайном порядке, дальше по кругу по одной карточке
// слова — две карточки одного слова рядом только если другого не осталось
function interleave(lists, rand) {
  const order = lists.map(l => [...l]).sort(() => rand() - 0.5)
  const out = []
  while (order.some(l => l.length)) for (const l of order) if (l.length) out.push(l.shift())
  return out
}

// picked: [{ word, step, cards }] (pickToday); decks: Map(word → { phrase, cards: [{ id, nodes, lessonId }] })
// → { items: [{ key, word, card, attempt: 1 }], words: [...] }
export function buildSession(picked, decks, { lastCardIds = {}, noAudio = false, rand = Math.random } = {}) {
  const lists = []
  for (const { word, cards: n } of picked ?? []) {
    const deck = (decks.get(word)?.cards ?? []).filter(c => c?.nodes?.length && !(noAudio && cardHasAudio(c)))
    const chosen = rotate(deck, lastCardIds[word]).slice(0, n)
    if (chosen.length) lists.push(chosen.map(card => ({ key: `${word}:${card.id}:1`, word, card, attempt: 1 })))
  }
  const items = interleave(lists, rand)
  return { items, words: [...new Set(items.map(i => i.word))] }
}

export function startSession(built) {
  return { queue: built.items, index: 0, events: [], shownCards: {}, revealed: [] }
}

export const currentItem = s => s.queue[s.index] ?? null
export const isFinished = s => s.index >= s.queue.length
// У слова не осталось карточек впереди — его исход можно отправлять на сервер
// (так брошенная посреди сессия не теряет уже отвеченные слова)
export const wordDone = (s, word) => !s.queue.slice(s.index).some(q => q.word === word)

// result: 'correct' | 'wrong' | 'know'; timeMs — время ответа.
// deck: колода слова текущей карточки (для возврата другой карточкой)
export function answerCard(s, { result, timeMs = null }, deck = []) {
  const item = currentItem(s)
  if (!item) return s
  // Повтор другой карточкой пишется под id исходной: reviewOutcome группирует
  // по карточке, и «ошибка → верно на повторе» должна читаться как again
  const origCardId = item.origCardId ?? item.card.id
  const events = [...s.events, { word: item.word, cardId: origCardId, result, timeMs }]
  const shownCards = { ...s.shownCards, [item.word]: item.card.id }
  let queue = s.queue
  let revealed = s.revealed
  if (result === 'wrong' && item.attempt === 1) {
    const used = new Set(queue.filter(q => q.word === item.word).map(q => q.card.id))
    const other = deck.find(c => c?.nodes?.length && !used.has(c.id))
    const card = other ?? item.card
    queue = [...queue, { key: `${item.word}:${card.id}:2`, word: item.word, card, attempt: 2, origCardId }]
  } else if (result === 'wrong') {
    revealed = [...revealed, item.key] // вторая ошибка: показать ответ и дальше
  }
  return { ...s, queue, index: s.index + 1, events, shownCards, revealed }
}

// «Не могу слушать»: убрать из ОСТАВШЕЙСЯ очереди карточки со звуком
export function dropAudio(s) {
  const done = s.queue.slice(0, s.index)
  const rest = s.queue.slice(s.index).filter(q => !cardHasAudio(q.card))
  return { ...s, queue: [...done, ...rest] }
}

// → [{ word, outcome, cardId, events }] только по словам, у которых был ответ
export function wordOutcomes(s) {
  const byWord = new Map()
  for (const e of s.events) {
    if (!byWord.has(e.word)) byWord.set(e.word, [])
    byWord.get(e.word).push(e)
  }
  return [...byWord].map(([word, events]) => ({
    word, events, outcome: reviewOutcome(events), cardId: s.shownCards[word] ?? null,
  }))
}

// Фраза, разрезанная по слову сессии: [{ text, hit }] — hit у вхождений слова.
// Слово — ключ (нижний регистр), ищем без учёта регистра и только целиком (не
// внутри другого слова); апострофы ' и ’ равны
export function splitByWord(phrase, word) {
  if (!phrase) return []
  if (!word) return [{ text: phrase, hit: false }]
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")
  const re = new RegExp(`(?<=^|[^\\p{L}'’])${esc}(?=$|[^\\p{L}'’])`, 'giu')
  const parts = []
  let at = 0
  for (const m of phrase.matchAll(re)) {
    if (m.index > at) parts.push({ text: phrase.slice(at, m.index), hit: false })
    parts.push({ text: m[0], hit: true })
    at = m.index + m[0].length
  }
  if (at < phrase.length) parts.push({ text: phrase.slice(at), hit: false })
  return parts
}

// Фраза с закрытым словом: «I'm ●●●●●● to cook»
export const maskWord = (phrase, word) =>
  splitByWord(phrase, word).map(p => (p.hit ? '●'.repeat(p.text.length) : p.text)).join('')
