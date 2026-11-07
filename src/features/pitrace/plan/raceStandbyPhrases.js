// Дежурные фразы игры «Встряхни память» (этап 2 «Фразы», CONCEPT_RACE.md → «Данные: план из памяти»): фразы ПЕРВЫХ ТРЁХ опубликованных модулей по created_at (по возрастанию; равные — по id).
// Ими добирают план до трёх фраз, пока своих фраз в памяти меньше трёх (запутыватели круга «Пойми»), и их же словами добирают plan.extraWords до шести (вместо захардкоженных STANDBY_WORDS).
// Нет сети / модулей меньше трёх — запасные фразы из слов STANDBY_WORDS (raceStandby.js). Чистые функции без сети.
import { normText } from '../../player/modules/rotate-phone/wordLaneRecipe.js'
import { STANDBY_WORDS } from '../raceStandby.js'
import { levelOfWord } from '../../../shared/lib/memory/memoryLevels.js'
import { phraseOfModule, phraseRu, phraseScene, phraseAudio, phraseLevel } from './racePhraseOf.js'

export const STANDBY_COUNT = 3

// Запас без сети: фразы фикстур стенда (rehearsalFixtures.js) со словами и переводами из STANDBY_WORDS; смысл — перевод фразы
const RESERVE = [
  { id: 'reserve:nice', text: 'Nice to meet you', ru: 'Приятно познакомиться', words: ['nice', 'meet'] },
  { id: 'reserve:where', text: 'Where are you from', ru: 'Откуда ты', words: ['where', 'from'] },
  { id: 'reserve:remember', text: 'Remember', ru: 'Помнить', words: ['remember'] },
]

const time = m => (m?.created_at ? String(m.created_at) : '￿') // без даты — в конец

/** Первые n опубликованных модулей по created_at asc (равные и без даты — по id) */
export function firstModules(curricula, n = STANDBY_COUNT) {
  return (Array.isArray(curricula) ? curricula : []).filter(m => m?.published && normText(m.title))
    .sort((a, b) => time(a).localeCompare(time(b)) || String(a.id).localeCompare(String(b.id))).slice(0, n)
}

/** Запасные фразы (без сети): уровни слов — из памяти, нет строки — ступень STANDBY_WORDS */
export function reservePhrases(ctx = {}) {
  return RESERVE.map(r => {
    const key = normText(r.text)
    const words = r.words.map(t => { const s = STANDBY_WORDS.find(x => x.text === t); const row = ctx.memByWord?.get(t); return { text: t, translation: s.translation, level: row ? levelOfWord(row) : s.level } })
    return { id: r.id, text: r.text, key, words, ru: phraseRu(ctx.ruMap, key, r.ru), scene: phraseScene(ctx.sceneMap, key), own: false, level: phraseLevel(words), audio: phraseAudio(ctx.audioMap, key) }
  })
}

/**
 * Дежурные фразы (own: false) по порядку: первые три опубликованных модуля, за ними запасные (их берут, только если модулей не хватило). ctx — как у phraseOfModule (lessonById, memByWord, ruMap, audioMap).
 * skip — ключи фраз, которые уже в плане (своя фраза из первых трёх модулей остаётся своей).
 */
export function standbyPhrases(curricula, ctx = {}, skip = new Set()) {
  const mods = firstModules(curricula).map(m => phraseOfModule(m, { ...ctx, own: false })).filter(Boolean)
  return [...mods, ...reservePhrases(ctx).filter(r => !mods.some(m => m.key === r.key))].filter(p => !skip.has(p.key))
}

/** Слова дежурных фраз для добора extraWords: [{ text, translation, level, due: false, lapses: 0 }] с переводом, без повторов и без слов taken (Set ключей) */
export function standbyExtraWords(phrases, taken = new Set()) {
  const seen = new Set(taken)
  return (phrases ?? []).filter(p => !p.own).flatMap(p => p.words)
    .filter(w => { const k = normText(w.text); if (!k || !w.translation || seen.has(k)) return false; seen.add(k); return true })
    .map(w => ({ text: w.text, translation: w.translation, level: w.level, due: false, lapses: 0 }))
}
