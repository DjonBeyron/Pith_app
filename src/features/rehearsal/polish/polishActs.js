// Карточки блока «Шлифовка репетиции» (Админ → «Голос»): этапы по порядку сценария, их короткое описание и доступность в текущем плане. Этапы и названия — rehearsalOnly.js; чистые функции без React.
import { ONLY_IDS, ONLY_ACTS, ONLY_TITLES } from '../rehearsalOnly.js'
import { buildActs } from '../rehearsalRecipe.js'

export const POLISH_HINTS = {
  intro: 'Фраза падает, открываются дорожки, Пит говорит про фразу.',
  warmup: 'Слова «к повтору» по переводу, по одному на дорожке.',
  read: 'Диктор говорит всю фразу, куски подсвечиваются; потом повтор.',
  build: 'Фраза с конца: диктор — ты, «чётко» и «обычно».',
  blind: 'Дорожки без подписей, подсказка при заминке.',
  discern: 'Слова с двойниками: тап по услышанному, потом сказать.',
  take: 'Вся фраза с записью голоса и экран «Пит / Ты».',
  summary: 'Экран итога с подставным результатом.',
}

/** Этапы блока: [{ id, title, hint }] в порядке сценария */
export const POLISH_ACTS = ONLY_IDS.map(id => ({ id, title: ONLY_TITLES[id], hint: POLISH_HINTS[id] }))

/** Есть ли этап в плане: у одного слова нет читки и сборки, у фразы без двойников нет «Различи». Заставка и итог есть всегда */
export function actAvailable(plan, id) {
  if (!plan) return false
  if (id === 'intro' || id === 'summary') return true
  const { acts } = buildActs(plan, { only: null })
  return acts.some(a => ONLY_ACTS[id].includes(a.id))
}

/** План с пометкой «только этот этап» (id) или целиком (null) — то, что уходит в ноду игры */
export const planForAct = (plan, only) => (plan ? (only ? { ...plan, only } : { ...plan, only: undefined }) : null)
