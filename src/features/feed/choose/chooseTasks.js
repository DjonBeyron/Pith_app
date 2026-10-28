import { needsSound } from '../../review/reviewSession.js'

// Выбор карточки для игры ленты «Выбери слово» (B4). Источник — колоды повторения (reviewDecks.buildDecks):
// карточка уже упакована с контекстом — 1–3 ноды + нода word_choice. Чистые функции, без сети и React.
const MAX_NODES = 4 // 1–3 ноды контекста + само задание: длиннее — не «игра на минутку»

const choiceNode = card => (card?.nodes ?? []).find(n => n.type === 'word_choice') ?? null

// Карточка годится для игры: есть word_choice и она короткая
export const hasChoose = card => !!choiceNode(card) && card.nodes.length <= MAX_NODES

// Верный вариант задания — для подписи итога «Не то — верно: …» ('' — не размечен)
export function correctOption(card) {
  const options = choiceNode(card)?.typeData?.word_choice?.options ?? []
  return options.find(o => o?.isCorrect && o.text)?.text ?? ''
}

// Подпись итога ответа: «Верно!» / «Не то — верно: …» (без красного, без цифр); result — { ok } | null
export function verdictOf(result, card) {
  if (!result) return null
  if (result.ok) return { kind: 'ok', text: 'Верно!' }
  const right = correctOption(card)
  return { kind: 'bad', text: right ? `Не то — верно: ${right}` : 'Не то — ничего страшного' }
}

// Текстовая версия карточки (звука нет): ноды, без которых не обойтись без звука, убраны (голосовое с текстом и
// сцена с облачками остаются — они читаются), помета textOnly говорит плееру играть беззвучно (muted)
export function textOnly(card) {
  const nodes = (card?.nodes ?? []).filter(n => n.type === 'word_choice' || !needsSound(n))
  return { ...card, nodes, textOnly: true }
}

// В текстовой версии, кроме самого задания, остаётся хоть один контекст
const readable = card => textOnly(card).nodes.length > 1

// decks: Map(слово → { modules, cards }) (reviewDecks.buildDecks); exclude — слова, которые уже предлагали;
// inMemory — Map/Set слов в памяти человека; needText — звука нет, нужна карточка с читаемым контекстом.
// Предпочитаем слова НЕ в памяти (их и учим), нет таких — берём из памяти.
// → { word, card, moduleId } | null
export function pickChooseCard(decks, { exclude = [], inMemory = new Set(), needText = false, rand = Math.random } = {}) {
  const skip = new Set(exclude)
  const fresh = []
  const known = []
  for (const [word, deck] of decks ?? []) {
    if (skip.has(word)) continue
    const cards = (deck?.cards ?? []).filter(c => hasChoose(c) && (!needText || readable(c)))
    if (!cards.length) continue
    ;(inMemory.has(word) ? known : fresh).push({ word, cards, moduleId: deck.modules?.[0]?.id ?? null })
  }
  const list = fresh.length ? fresh : known
  if (!list.length) return null
  const w = list[Math.floor(rand() * list.length)]
  return { word: w.word, card: w.cards[Math.floor(rand() * w.cards.length)], moduleId: w.moduleId }
}
