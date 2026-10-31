// «Рецепт» урока для игры «Повтори за диктором»: из фразы (до трёх кусков) собирается последовательность раундов и ступеней. Чистые функции — без React и DOM, проверяются тестами.
// Фраза — куски через «|»: «I'm | trying | to learn» (три куска = три дорожки; дорожка хранит кусок, дорожки слева направо читаются как предложение). Слово без «|» — один кусок.
// Раунды (по приёмам живого учителя: «я показываю — мы делаем вместе — ты делаешь сам», подсказки постепенно исчезают):
//  build  — НАРАЩИВАНИЕ: кусок 1 ×3 → кусок 2 ×3 → куски 1+2 ×3 → кусок 3 ×3 → вся фраза ×3. На каждой ступени сначала диктор проговаривает три раза, потом ученик повторяет три раза.
//  order  — ПОРЯДОК (только от двух кусков): дорожки перемешаны. Диктор называет кусок — ученик тапает его дорожку; потом диктор произносит всю фразу — ученик тапает дорожки по порядку.
//  discern — РАЗЛИЧИ (для куска, у которого автор в ноде дописал слова-запутыватели): слов на экране нет. Диктор называет кусок, затем по очереди идут пилюли, и у каждой при открытии звучит её слово — верное или похожее; нужно тапнуть дорожку, где прозвучало искомое слово. Раунд на каждый такой кусок.
//  blind  — ВСЛЕПУЮ (только от двух кусков): ни текста, ни перевода, только дорожки. Ученик говорит куски по очереди (по пилюле на дорожку), потом всю фразу целиком.
// Фраза из одного куска (слово) — только build: диктор три раза, ученик три раза (три пилюли в трёх дорожках), как в первой версии игры.
import { tokenize } from '../../../../shared/lib/speech/speechMatch.js'
import { SLOT_COUNT } from './wordLaneTimeline.js'

export const REPEATS = 3          // сколько раз проговаривается ступень
export const BLIND_FULL_REPS = 2  // сколько раз ученик говорит всю фразу в конце раунда «вслепую»

/** «I'm | trying | to learn» → ['I'm', 'trying', 'to learn'] (до SLOT_COUNT кусков, пустые отбрасываются) */
export const parsePhrase = text => String(text ?? '').split('|').map(s => s.trim()).filter(Boolean).slice(0, SLOT_COUNT)

/** Фраза в виде, в котором её сравнивает распознавание (сокращения раскрыты, регистр и знаки сняты) */
export const normText = text => tokenize(text).join(' ')

/** Номера кусков → ключ, например [0, 1] → '01' */
export const keyOf = parts => parts.join('')

/** Текст из кусков: [0, 1] → «I'm trying» */
export const textOf = (chunks, parts) => parts.map(i => chunks[i]).join(' ')

/** Дорожка пилюли: у фразы из нескольких кусков дорожка = номер куска; у одного слова пилюли повторов идут по дорожкам 0, 1, 2 */
export const laneOf = (chunkCount, chunk, repIdx) => (chunkCount === 1 ? repIdx % SLOT_COUNT : chunk)

/** Состав ступеней наращивания: какие куски в каких ступенях */
export function buildParts(n) {
  if (n <= 1) return [[0]]
  if (n === 2) return [[0], [1], [0, 1]]
  return [[0], [1], [0, 1], [2], [0, 1, 2]]
}

const rep = parts => ({ parts })

const TITLES = { build: 'Повторяй', order: 'Выбери дорожку', discern: 'Различи', blind: 'Вслепую' }
export const MAX_CONFUSERS = 2   // слов-запутывателей на кусок (вместе с верным словом — три дорожки)
export const DISCERN_LEAD_MS = 900    // «Различи»: пока диктор называет искомое слово, пилюли ещё не выкатываются — первая выкатывается через столько мс
export const DISCERN_STAGGER_MS = 800 // дальше пилюли идут по очереди с таким шагом
export const DISCERN_PROMPTS = 2 // сколько раз диктор говорит кусок в раунде «Различи» (дорожки каждый раз перетасованы)

/** Слова-запутыватели из ноды → по куску массив до MAX_CONFUSERS слов: пустые, повторы, совпадающие с самим куском и лишние отбрасываются. confusers — массив (по номеру куска) массивов строк */
export function normalizeConfusers(confusers, chunks) {
  return chunks.map((chunk, i) => {
    const seen = new Set([normText(chunk)])
    const out = []
    for (const w of Array.isArray(confusers?.[i]) ? confusers[i] : []) {
      const text = String(w ?? '').trim().slice(0, 40)
      const key = normText(text)
      if (!key || seen.has(key)) continue
      seen.add(key); out.push(text)
      if (out.length >= MAX_CONFUSERS) break
    }
    return out
  })
}

/**
 * Подсказки раунда «Различи» для куска chunk: на каждую диктор говорит этот кусок, а в дорожках стоят он и запутыватели. texts — слово каждой дорожки ('' — дорожки нет; на экране слов НЕТ, только озвучка: диктор называет искомое слово, потом по очереди звучит слово каждой пилюли), answer — верная дорожка, slots — дорожки с пилюлями, lead / stagger — когда выкатывается первая пилюля и шаг между ними (мс).
 * С двумя словами занимаются крайние дорожки (0 и 2), с тремя — все. Верное слово каждый раз на другой дорожке (без случайности — раскладка не зависит от запуска).
 */
export function discernPrompts(chunks, chunk, words) {
  const slots = words.length >= MAX_CONFUSERS ? [0, 1, 2] : [0, 2]
  return Array.from({ length: DISCERN_PROMPTS }, (_, j) => {
    const answer = slots[(chunk + 1 + j) % slots.length]
    const rest = [...words]
    const texts = ['', '', ''] // слова дорожек (не пишутся на экране — ученик слышит каждое, когда пилюля открывается)
    for (const lane of slots) texts[lane] = lane === answer ? chunks[chunk] : rest.shift()
    return { id: `discern-${chunk}-${j}`, parts: [chunk], answer: [answer], slots, texts, stagger: DISCERN_STAGGER_MS, lead: DISCERN_LEAD_MS }
  })
}

/**
 * Рецепт: { chunks, rounds: [{ kind, title, steps|prompts }] }. Ступень: { id, kind: 'dictor-student'|'student', parts, reps: [{ parts }], text, labels: куски, видимые в подписях дорожек }.
 * Для 'order': prompts — { id, parts } (что произносит диктор, какие дорожки тапнуть и в каком порядке); для 'discern' — ещё answer (верная дорожка), slots и words (подписи дорожек). confusersIn — слова-запутыватели по кускам (normalizeConfusers).
 */
export function buildRecipe(chunksIn, confusersIn = null) {
  const chunks = (chunksIn ?? []).map(c => String(c ?? '').trim()).filter(Boolean).slice(0, SLOT_COUNT)
  const n = chunks.length
  if (!n) return { chunks: [], rounds: [] }
  const all = chunks.map((_, i) => i)
  const rounds = []
  const confusers = normalizeConfusers(confusersIn, chunks)

  rounds.push({
    kind: 'build',
    title: n === 1 ? 'Повтори за диктором' : 'Раунд 1 · Повторяй',
    steps: buildParts(n).map((parts, i) => ({
      id: `build-${i}`, kind: 'dictor-student', parts, text: textOf(chunks, parts), labels: all, active: parts,
      reps: Array.from({ length: REPEATS }, () => rep(parts)),
    })),
  })

  if (n >= 2) {
    // Раунд «Порядок»: сначала по одному куску вперемешку (в порядке, который не совпадает с фразой), потом вся фраза
    const shuffled = all.map(i => (i + 1) % n) // детерминированный порядок вопросов: 1, 2, 0 (для двух кусков: 1, 0)
    rounds.push({
      kind: 'order',
      title: 'Раунд 2 · Выбери дорожку',
      prompts: [...shuffled.map((c, i) => ({ id: `order-${i}`, parts: [c] })), { id: 'order-full', parts: all }],
    })
  }
  // «Различи» — по раунду на каждый кусок, где автор дописал запутывателей (после «Порядка», до «Вслепую»)
  all.filter(i => confusers[i].length).forEach(i => rounds.push({ kind: 'discern', title: 'Различи', chunk: i, prompts: discernPrompts(chunks, i, confusers[i]) }))
  if (n >= 2) {
    rounds.push({
      kind: 'blind',
      title: 'Раунд 3 · Вслепую',
      steps: [
        { id: 'blind-0', kind: 'student', parts: all, text: '', labels: [], active: all, reps: all.map(i => rep([i])) },
        { id: 'blind-1', kind: 'student', parts: all, text: textOf(chunks, all), labels: [], active: all, reps: Array.from({ length: BLIND_FULL_REPS }, () => rep(all)) },
      ],
    })
  }
  // Номера раундов по порядку (у одного слова без запутывателей — просто «Повтори за диктором»)
  if (rounds.length > 1) rounds.forEach((r, i) => { r.title = `Раунд ${i + 1} · ${TITLES[r.kind]}` })
  return { chunks, rounds }
}

/** Перестановка дорожек для раунда «Порядок»: lane → номер куска. Не совпадает с естественным порядком (иначе порядок угадывать нечего); для одного куска — тождественная.
 * rng (функция () => число из [0, 1), «Репетиция»: поток от семени плана) — ряд перемешан, но всё равно не естественный; без rng — всегда одна и та же */
export function orderLanes(n, rng = null) {
  if (n <= 1) return [0]
  const base = n === 2 ? [1, 0] : [2, 0, 1]
  if (!rng) return base
  for (let t = 0; t < 8; t++) {
    const p = [...base]
    for (let i = p.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [p[i], p[j]] = [p[j], p[i]] }
    if (p.some((c, i) => c !== i)) return p
  }
  return base
}

/** Все ступени и подсказки раундов подряд (для общего счёта и прогресса) */
export const flattenRecipe = recipe => recipe.rounds.flatMap(r => r.steps ?? r.prompts ?? [])

/** Цели распознавания ступени: уникальные тексты повторов и номер цели у каждого повтора — [{ target }] */
export function stepTargets(step, chunks) {
  const texts = []
  const repTarget = step.reps.map(rp => {
    const t = textOf(chunks, rp.parts)
    let k = texts.indexOf(t)
    if (k < 0) { texts.push(t); k = texts.length - 1 }
    return k
  })
  return { texts, repTarget }
}
