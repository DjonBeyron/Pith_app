import { lookupWordAudio } from '../../../shared/lib/wordAudio/wordAudioLookup.js'

// Выбор задачи для игры «Слово голосом → картинка» (B5). Источник — те же колоды повторения (reviewDecks.buildDecks):
// ищем карточки с нодой `photo_choice` (typeData.photo_choice { photos: [{ id, photoUrl, imagePrompt, label }],
// correctIndexes }). На экран идут три картинки: одна верная + две неверные. label и imagePrompt слова не выдают:
// label ученик не видит (там обычно сама фраза), imagePrompt — только подпись картинки для скринридера.
// Слово звучит из библиотеки word_audio (wordAudioLookup); нет озвучки или звук выключен — слово текстом.
// Нет ни одной подходящей карточки — задачи нет (null), игра молчит. Чистые функции, без сети и React.
const OPTIONS = 3
const isUrl = u => typeof u === 'string' && /^https?:\/\//.test(u)

const photoNode = card => (card?.nodes ?? []).find(n => n.type === 'photo_choice') ?? null

function shuffle(list, rand) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Три картинки из ноды: [{ id, url, alt, correct }] в случайном порядке | null (нет верной или двух неверных с адресом)
export function pictureOptions(node, rand = Math.random) {
  const d = node?.typeData?.photo_choice
  const photos = Array.isArray(d?.photos) ? d.photos : []
  const right = new Set((d?.correctIndexes ?? []).filter(Number.isInteger))
  const rights = []
  const wrongs = []
  photos.forEach((p, i) => {
    if (!isUrl(p?.photoUrl)) return
    ;(right.has(i) ? rights : wrongs).push({
      id: p.id ?? `p${i}`, url: p.photoUrl, alt: typeof p.imagePrompt === 'string' ? p.imagePrompt.trim() : '', correct: right.has(i),
    })
  })
  if (!rights.length || wrongs.length < OPTIONS - 1) return null
  const one = rights[Math.floor(rand() * rights.length)]
  return shuffle([one, ...shuffle(wrongs, rand).slice(0, OPTIONS - 1)], rand)
}

// decks: Map(слово → { modules, cards }); wordAudio — Map ключ → строка word_audio (или null);
// exclude — слова, которые уже предлагали; inMemory — слова в памяти (не из памяти — раньше).
// → { word, moduleId, task: { options, audioUrl | null } } | null
export function pickPictureTask(decks, { exclude = [], inMemory = new Set(), wordAudio = null, rand = Math.random } = {}) {
  const skip = new Set(exclude)
  const fresh = []
  const known = []
  for (const [word, deck] of decks ?? []) {
    if (skip.has(word)) continue
    const nodes = (deck?.cards ?? []).map(photoNode).filter(n => n && pictureOptions(n, () => 0))
    if (nodes.length) (inMemory.has(word) ? known : fresh).push({ word, nodes, moduleId: deck.modules?.[0]?.id ?? null })
  }
  const list = fresh.length ? fresh : known
  if (!list.length) return null
  const w = list[Math.floor(rand() * list.length)]
  const options = pictureOptions(w.nodes[Math.floor(rand() * w.nodes.length)], rand)
  const url = lookupWordAudio(w.word, wordAudio)?.url
  return { word: w.word, moduleId: w.moduleId, task: { options, audioUrl: isUrl(url) ? url : null } }
}

// Открытая игра из выбора (feedGame: kind.build): звука нет — слово текстом (audioUrl убираем)
export const openPicture = (pick, { sound }) => ({ task: sound ? pick.task : { ...pick.task, audioUrl: null } })
