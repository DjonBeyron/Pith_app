import { hasChoose } from '../../feed/choose/chooseTasks.js'
import { hitsOf, audioFor, isFillWord } from '../../feed/fill/fillTasks.js'
import { pickConfusers } from '../../feed/fill/pickConfusers.js'
import { hasPicture } from '../../feed/picture/pictureTasks.js'

// Материал игр ленты в колодах: те же правила годности, что у самих игр (функции игр, а не их копии).
// decks — Map(слово → { phrase, modules, cards }) из reviewDecks.buildDecks.
// → { choose: Set слов, fill: { voiced: Set, text: Set, lines }, picture: Set слов }
// Считаем слова, а не карточки/реплики: игра исключает уже предложенное слово, повторов на неделю между словами нет.

// «Выбери слово»: у слова есть карточка с word_choice, не длиннее 4 нод
function chooseWords(decks) {
  const out = new Set()
  for (const [word, deck] of decks) if ((deck.cards ?? []).some(hasChoose)) out.add(word)
  return out
}

// «Картинка»: у слова есть карточка photo_choice с верной и двумя неверными картинками
function pictureWords(decks) {
  const out = new Set()
  for (const [word, deck] of decks) if ((deck.cards ?? []).some(hasPicture)) out.add(word)
  return out
}

// «Дополни реплику»: реплика со словом (3–20 слов) и двумя двойниками; voiced — ещё и с файлом и таймингом слова
function fillWords(decks) {
  const all = [...decks.keys()]
  const voiced = new Set()
  const text = new Set()
  let lines = 0
  for (const [word, deck] of decks) {
    if (!isFillWord(word)) continue
    for (const { line, hit } of hitsOf(deck, word)) {
      const pool = [...all, ...hit.tokens.map(t => t.norm)]
      if (pickConfusers(word, pool, { rand: () => 0 }).length < 2) continue
      text.add(word)
      if (audioFor(line, word, hit.k)) { voiced.add(word); lines++ }
    }
  }
  return { voiced, text, lines }
}

export function gameMaterial(decks) {
  return { choose: chooseWords(decks), fill: fillWords(decks), picture: pictureWords(decks) }
}
