// Сборка фраз и слов плана «Встряхни память» из памяти (этап 2 «Фразы», CONCEPT_RACE.md → «Данные: план из памяти»). Чистые функции: все данные — аргументами (их грузит racePlanSources.js),
// случайность — только rngFor(seed) при равенстве (без Math.random), поэтому один и тот же план из одних и тех же данных.
//  • phrases: фраза текущего урока первой (own), затем свои (модуль начат, закреплён или его слово в памяти; сначала со слабыми словами, потом по уровню фразы), затем дежурные, пока фраз меньше трёх; всего 3…6;
//  • extraWords: слова памяти с переводом (сначала просроченные, потом низкие уровни, потом с промахами), до 12; меньше шести — добор словами дежурных фраз.
import { normText } from '../../player/modules/rotate-phone/wordLaneRecipe.js'
import { wordKey } from '../../../shared/lib/wordAudio/wordKey.js'
import { levelOfWord } from '../../../shared/lib/memory/memoryLevels.js'
import { rngFor, rngShuffle, todayIso } from '../../rehearsal/rehearsalSeed.js'
import { phraseOfModule, phraseOfPlan, allTranslations, phraseAudioMap } from './racePhraseOf.js'
import { standbyPhrases, standbyExtraWords } from './raceStandbyPhrases.js'

export const PHRASES_MIN = 3
export const PHRASES_MAX = 6
export const EXTRA_MAX = 12
export const EXTRA_MIN = 6 // меньше — добор словами дежурных фраз
const WEAK_LEVEL = 1       // слово «слабое»: уровень ≤ 1, просрочено или с промахами

/** Общий контекст сборки из загруженных данных (deps — см. racePlanSources.loadPlanDeps) */
export function planContext(deps = {}) {
  const memByWord = new Map()
  for (const row of Array.isArray(deps.memory) ? deps.memory : []) { const k = wordKey(row?.word); if (k && !memByWord.has(k)) memByWord.set(k, row) }
  return {
    memByWord,
    lessonById: new Map((Array.isArray(deps.lessons) ? deps.lessons : []).map(l => [l.id, l])),
    ruMap: deps.ruMap && typeof deps.ruMap === 'object' ? deps.ruMap : {},
    sceneMap: deps.sceneMap && typeof deps.sceneMap === 'object' ? deps.sceneMap : {},
    audioMap: phraseAudioMap(deps.audioMap, deps.wordAudio), // целые фразы: word_audio phrase:<key> (главнее) и game2_phrases
    started: new Set(deps.startedIds ?? []),
    pinned: new Set((deps.phraseRows ?? []).map(r => r?.module_id).filter(Boolean)),
    today: deps.today || todayIso(),
  }
}

const isDue = (row, today) => !!row?.due_on && row.due_on <= today
const weakRow = (row, today) => !!row && (levelOfWord(row) <= WEAK_LEVEL || isDue(row, today) || Number(row.lapses) > 0)

/** Ранг при равенстве: перестановка ключей по семени (одно семя — один порядок) */
function rankBy(seed, scope, keys) {
  const order = rngShuffle(rngFor(seed, scope), [...keys].sort())
  return new Map(order.map((k, i) => [k, i]))
}

/** Текущая фраза: модуль currentId → модуль с той же фразой, что у плана → фраза из самого плана */
function currentPhrase(base, curricula, currentId, ctx) {
  const key = normText((base?.chunks ?? []).join(' ') || base?.phrase)
  const mod = curricula.find(m => currentId != null && String(m?.id) === String(currentId)) ?? curricula.find(m => m?.published && key && normText(m.title) === key)
  return (mod && phraseOfModule(mod, { ...ctx, own: true })) || phraseOfPlan(base, ctx)
}

/** Своя ли фраза: модуль начат, закреплён или хоть одно его слово в памяти */
const ownPhrase = (p, ctx) => ctx.started.has(p.id) || ctx.pinned.has(p.id) || p.words.some(w => ctx.memByWord.has(w.text))

/**
 * Фразы плана (контракт plan.phrases): { base, deps, seed, currentId } → [{ id, text, key, words, ru, own, level, audio }], 3…6 штук, текущая первой.
 */
export function buildPhrases({ base, deps = {}, seed = base?.seed ?? 'memory', currentId = deps.currentId ?? base?.moduleId ?? null }) {
  const ctx = planContext(deps)
  const curricula = Array.isArray(deps.curricula) ? deps.curricula : []
  const first = currentPhrase(base, curricula, currentId, ctx)
  const out = first ? [first] : []
  const keys = new Set(out.map(p => p.key))
  const own = curricula.filter(m => m?.published).map(m => phraseOfModule(m, { ...ctx, own: true }))
    .filter(p => p && !keys.has(p.key) && ownPhrase(p, ctx))
    .filter((p, i, list) => list.findIndex(x => x.key === p.key) === i)
  const rank = rankBy(seed, 'race-phrases', own.map(p => p.id))
  const weak = p => (p.words.some(w => weakRow(ctx.memByWord.get(w.text), ctx.today)) ? 0 : 1)
  own.sort((a, b) => weak(a) - weak(b) || a.level - b.level || rank.get(a.id) - rank.get(b.id))
  for (const p of own) { if (out.length >= PHRASES_MAX) break; out.push(p); keys.add(p.key) }
  if (out.length < PHRASES_MIN) for (const p of standbyPhrases(curricula, ctx, keys)) { if (out.length >= PHRASES_MIN) break; out.push(p); keys.add(p.key) }
  return out
}

/**
 * Слова добора (контракт plan.extraWords): [{ text, translation, level, due, lapses }] ≤ 12. Слова памяти с переводом из word_translations опубликованных модулей, без слов фразы плана;
 * порядок — просроченные, ниже уровень, больше промахов, при равенстве — по семени. Меньше шести — добор словами дежурных фраз (первые три модуля, даже если в plan.phrases их нет).
 */
export function buildExtraWords({ base, deps = {}, seed = base?.seed ?? 'memory' }) {
  const ctx = planContext(deps)
  const tr = allTranslations(deps.curricula)
  const skip = new Set([...(base?.chunks ?? []).join(' ').split(/\s+/), ...(base?.words ?? []).map(w => w.text)].map(wordKey).filter(Boolean))
  const list = [...ctx.memByWord.entries()].filter(([k, row]) => !skip.has(k) && levelOfWord(row) >= 1 && tr.get(k))
    .map(([k, row]) => ({ text: k, translation: tr.get(k), level: levelOfWord(row), due: isDue(row, ctx.today), lapses: Math.max(0, Math.floor(Number(row.lapses) || 0)) }))
  const rank = rankBy(seed, 'race-extra', list.map(w => w.text))
  list.sort((a, b) => (b.due - a.due) || a.level - b.level || b.lapses - a.lapses || rank.get(a.text) - rank.get(b.text))
  const out = list.slice(0, EXTRA_MAX)
  if (out.length < EXTRA_MIN) out.push(...standbyExtraWords(standbyPhrases(deps.curricula, ctx), new Set([...skip, ...out.map(w => w.text)])).slice(0, EXTRA_MIN - out.length))
  return out
}
