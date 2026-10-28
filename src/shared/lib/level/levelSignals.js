// Событие журнала (track.js) → сигнал для applySignal (levelModel.js) или null.
// Чистая функция: без React и сети. ctx = { difficultyOf(moduleId) → 1|2|3|null } — сложность
// слайда ленты (в feed_swipe from/to — id модулей, а не индексы). Событие, которое уровня
// не касается, и сигнал без нужной сложности (пролист) дают null.

// Быстрее — «пролистал», дольше — «досмотрел»; между ними сигнала нет (неоднозначно)
export const QUICK_SKIP_MS = 2000
export const WATCHED_MS = 8000

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const diffOf = (ctx, id) => (id ? ctx?.difficultyOf?.(id) ?? null : null)

function swipeSignal(p, ctx) {
  const ms = num(p.ms_prev)
  if (ms == null) return null
  const difficulty = diffOf(ctx, p.from)
  if (ms < QUICK_SKIP_MS) return difficulty ? { type: 'quick_skip', difficulty } : null // без сложности слайда «лёгкое/сложное» не различить
  if (ms >= WATCHED_MS) return { type: 'watched', difficulty }
  return null
}

const hard = (p, ctx) => ({ type: 'hard_sign', difficulty: diffOf(ctx, p.module_id) })
const answer = (axis, ok) => ({ type: 'answer', axis, difficulty: null, ok: !!ok }) // сложность задания неизвестна — модель возьмёт текущий уровень

export function signalFromEvent(name, props, ctx) {
  const p = props ?? {}
  switch (name) {
    case 'feed_swipe': return swipeSignal(p, ctx)
    case 'feed_slow': return p.on === true ? hard(p, ctx) : null // отпустил (off) — не признак трудности
    case 'feed_reveal':
    case 'feed_phrase_open': return hard(p, ctx)
    case 'feed_ladder': { // итог лесенки второго визита (features/feed/ladder): top — потолок «спокойно», hard — первая трудная ступень, 0 — нет
      const top = [1, 2, 3].includes(p.top) ? p.top : null
      const hardAt = [1, 2, 3].includes(p.hard) ? p.hard : null
      return top || hardAt ? { type: 'ladder', top, hardAt } : null
    }
    case 'scene_task_answer': return answer('ear', p.ok)
    case 'lesson_answer':
    case 'feed_recall_answer': return answer('vocab', p.ok)
    case 'feed_catch_check': return num(p.total) > 0 ? answer('vocab', p.ok === p.total) : null
    case 'feed_difficulty_vote': { // голос сложности (levelFeed.reportDifficultyVote; в журнал не пишется)
      const value = Number(p.value)
      return value >= 1 && value <= 3 ? { type: 'difficulty_vote', difficulty: diffOf(ctx, p.module_id), value } : null
    }
    case 'prompt_answer': { // ответ Пита по поведению (B3): id вида 'behavior:…', answer — слово ответа
      if (typeof p.id !== 'string' || !p.id.startsWith('behavior:')) return null
      return ['too_fast', 'too_easy', 'fine'].includes(p.answer) ? { type: 'pit_answer', value: p.answer } : null
    }
    default: return null
  }
}
