// Разнообразие ВНУТРИ актов репетиции (CONCEPT_REHEARSAL.md §8): что именно выбирается по семени плана (rehearsalSeed.js) и что не случайно никогда. Порядок актов фиксированный; здесь — разминка, сборка с конца и «без текста»
// (читка — реплика «зачем», rehearsalLines.js; «Различи» — rehearsalDiscern.js; зеркало — mirror/mirrorNotes.js). У каждого акта свой поток чисел (rngFor(seed, 'warmup' | 'build' | 'blind')), числа берутся в фиксированном порядке:
// один семя — один выбор, на запуск одного этапа «Шлифовки» выбор не влияет. Чистые функции, без React и DOM.
//  Разминка: участвуют ВСЕ слова фразы (warmupWords); первое слово — самое «просроченное» (должно быть к повтору, больше промахов; при равенстве — первое в плане), потом остальные слова «к повтору» вперемешку, потом остальные слова фразы вперемешку; дорожка слова — случайная из трёх, но не та же, что у предыдущего слова
//            (у одного слова — по центру, как раньше); chunkLane — дорожка куска, где слово стоит в фразе (по ней «без текста» подписывает слабое слово);
//  Сборка:   проходы последней ступени всегда «чётко», потом «обычно» (реплика «обычно» начинается с «И ещё раз» — решение владельца); при двух кусках первая ступень — [1] или [0] (потом [0,1]); при трёх структура [2] → [1,2] → [0,1,2] не меняется;
//  Без текста: какая подсказка при «застрял» первой — первое слово или перевод куска; второй проход — наоборот.
import { rngFor, rngBool, rngInt, rngShuffle } from './rehearsalSeed.js'
import { laneOfWord } from './rehearsalPlan.js'
import { describeLayout } from './rehearsalDiscern.js'

export const LANE_COUNT = 3

/** «Просроченность» слова: должно быть к повтору — важнее всего, потом число промахов */
export const overdueRank = w => (w.due ? 1000 : 0) + (Number(w.lapses) || 0)

/** Слова разминки (warmupWords) в порядке сессии: [самое просроченное, остальные «к повтору» вперемешку, слова фразы без карточки «к повтору» вперемешку]; каждому — idx (номер в плане: по нему журнал и итог находят ступень), lane (где пилюля), chunkLane (куда слово ставит фраза) */
export function orderWarmup(words, seed, { center = false } = {}) {
  const tagged = words.map((w, idx) => ({ ...w, idx, chunkLane: w.lane }))
  if (!tagged.length) return []
  const rng = rngFor(seed, 'warmup')
  const first = tagged.reduce((best, w) => (overdueRank(w) > overdueRank(best) ? w : best), tagged[0]) // при равенстве остаётся первый в плане
  const rest = tagged.filter(w => w !== first)
  const out = [first, ...rngShuffle(rng, rest.filter(w => w.due)), ...rngShuffle(rng, rest.filter(w => !w.due))] // «к повтору» всегда раньше остальных слов фразы
  let prev = -1
  return out.map(w => {
    if (center) return { ...w, lane: w.chunkLane }
    let lane = rngInt(rng, LANE_COUNT)
    if (lane === prev) lane = (lane + 1 + rngInt(rng, LANE_COUNT - 1)) % LANE_COUNT // та же дорожка подряд скучна: сдвиг на 1–2
    prev = lane
    return { ...w, lane }
  })
}

/** Выбор сборки: altStart — при двух кусках первая ступень [0] вместо [1] (всегда false при другом числе кусков). Число берётся всегда: поток не зависит от n */
export function buildVariety(n, seed) {
  const rng = rngFor(seed, 'build')
  const alt = rngBool(rng)
  return { altStart: n === 2 && alt }
}

/** Перевод первого куска для подсказки «без текста»: слово плана из этого куска с переводом, иначе перевод всей фразы; нет перевода — '' */
export function chunkTranslation(plan) {
  const at = plan.words.find(w => w.translation && laneOfWord(plan.chunks, w.text) === 0)
  return at?.translation || plan.translation || ''
}

/** Подсказки «застрял» в «без текста»: kinds — какая первая ('word' — первое слово, 'tr' — перевод куска), второй проход — в обратном порядке. Нет перевода — только слово */
export function blindVariety(plan) {
  const rng = rngFor(plan.seed, 'blind')
  const trFirst = rngBool(rng)
  const tr = chunkTranslation(plan)
  if (!tr) return { kinds: ['word'], reversed: ['word'], tr: '' }
  const kinds = trFirst ? ['tr', 'word'] : ['word', 'tr']
  return { kinds, reversed: [...kinds].reverse(), tr }
}

/** Подпись «что выбрано» для журнала: «разминка trying@2 > learn@0, читка rh_read_why_b, сборка чётко > обычно [1]…» — из актов (buildActs без only) */
export function describeVariants(acts) {
  const by = id => acts.find(a => a.id === id)
  const parts = []
  const w = by('warmup') ?? by('word')
  if (w) parts.push(`разминка ${w.words.map(x => `${x.text}@${x.lane}`).join(' > ')}`)
  const r = by('read')
  if (r) parts.push(`читка ${r.line}`)
  const b = by('build')
  if (b) parts.push(`сборка ${b.final.passes.map(p => (p.tag === 'Обычно' ? 'обычно' : 'чётко')).join(' > ')}${b.steps.length === 1 ? ` [${b.steps[0].parts.join(',')}]` : ''}`)
  const bl = by('blind')
  if (bl) parts.push(`без текста ${bl.passes[0].hintKinds?.map(k => (k === 'tr' ? 'перевод' : 'слово')).join(' > ') ?? 'слово'}`)
  const d = by('discern')
  if (d) parts.push(`различи ${d.words.map(x => `${x.text} ${describeLayout(x.prompts)}`).join('; ')}`)
  return parts.join(', ')
}

/** Строка журнала отладки на старте сессии: «[rehearsal] seed=… варианты: разминка …, читка …, сборка …, без текста …, различи …» */
export const sessionLogLine = (plan, acts) => `[rehearsal] seed=${plan.seed} варианты: ${describeVariants(acts)}`
