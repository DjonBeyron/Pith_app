import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { pickToday, dailyCardBudget, cardsShownToday, localDate } from '../../shared/lib/memory/dailyPick.js'
import { sessionMinutes } from '../review/reviewTeacher.js'
import { plural } from '../../shared/lib/plural.js'
import { buildLadder } from './memoryLadder.js'

// Всё, что показывает вкладка «Моя память» (PROJECT.md → «Вкладки»), из
// сырых данных — чистая функция без сети:
//   today   — главное действие: что повторить сегодня (pickToday в пределах
//             ОСТАТКА бюджета дня — карточки, уже показанные сегодня, не
//             повторяются второй сессией) или «на сегодня всё»;
//   next    — когда следующее повторение, если сегодня нечего;
//   week    — строка итогов 7 дней;
//   ladder  — ступени памяти (memoryLadder.js): новенькие / мои / родные и
//             постоянная память — главный экран вкладки;
//   phrases — фразы (модули со словом в памяти) → слова с силой;
//   known   — «Знаю N слов» (шаг ≥ 3 — слово пережило недельный интервал),
//   strongPhrases — закреплённые фразы (собраны целиком, golden);
//   today.phrase — фраза к закреплению: все слова «знаю», ещё не золотая
//             (одна в день — приходит в повторение после карточек слов);
//   vacation — «Отпуск» ({ since } | null): расписание на паузе, сегодня
//             ничего не предлагается (и точки на вкладке нет);
//   stepOf, lessonWord — Map слово → шаг и урок → слово: лента подсвечивает
//             знакомые слова и ранжирует фразы (features/feed/feedKnowledge.js).
export const KNOW_STEP = 3

// data: { memory: word_memory[], curricula: [{ id, title, lesson_ids }],
//         lessons: [{ id, title, deck }], reviews: review_events[], minutes, vacationSince,
//         golden: Set id закреплённых фраз }
export function buildLearnView({ memory = [], curricula = [], lessons = [], reviews = [], minutes = 5, vacationSince = null, golden = new Set() }, today) {
  const byWord = new Map(memory.map(m => [m.word, m]))
  const lessonById = new Map(lessons.map(l => [l.id, l]))

  // Уроки-слова модулей по порядку в модуле; у слова есть колода, если она
  // есть хоть у одного его урока (одно слово в разных модулях = одна колода)
  const deckWords = new Set()
  const moduleWords = curricula.map(m => {
    const ids = Array.isArray(m.lesson_ids) && m.lesson_ids.length > 2 ? m.lesson_ids.slice(1, -1) : []
    const seen = new Set()
    const words = []
    for (const id of ids) {
      const l = lessonById.get(id)
      const word = l && wordKey(l.title)
      if (!word || seen.has(word)) continue
      seen.add(word)
      if (l.deck) deckWords.add(word)
      words.push({ word, lessonId: id })
    }
    return { id: m.id, title: m.title ?? '', videoUrl: m.video_url ?? null, golden: golden.has(m.id), words }
  })

  const hasDeck = w => deckWords.has(w)
  const shown = cardsShownToday(reviews, today)
  const left = Math.max(0, dailyCardBudget(minutes) - shown)
  const picked = vacationSince ? [] : pickToday(memory, { today, budget: left, canReview: hasDeck })
  const cards = picked.reduce((n, p) => n + p.cards, 0)

  const upcoming = memory.filter(m => m.due_on > today && hasDeck(m.word)).map(m => m.due_on).sort()
  const next = upcoming.length ? { date: upcoming[0], count: upcoming.filter(d => d === upcoming[0]).length } : null

  const phrases = moduleWords
    .map(m => ({
      ...m,
      words: m.words.map(w => {
        const mem = byWord.get(w.word)
        return { ...w, step: mem?.step ?? null, due: mem?.due_on ?? null, hasDeck: hasDeck(w.word) }
      }),
    }))
    .filter(m => m.words.some(w => w.step))
    .map(m => ({ ...m, due: m.words.some(w => w.step && w.hasDeck && w.due <= today) }))
    .sort((a, b) => (b.due - a.due) || a.title.localeCompare(b.title))

  // Дом слова — первая фраза с ним: из шторки слова «Пройти урок целиком»
  const wordHome = new Map()
  for (const m of moduleWords) {
    for (const w of m.words) if (!wordHome.has(w.word)) wordHome.set(w.word, { lessonId: w.lessonId, phrase: m.title })
  }

  const ready = vacationSince ? null
    : phrases.find(p => !p.golden && p.words.length && p.words.every(w => (w.step ?? 0) >= KNOW_STEP))

  return {
    empty: memory.length === 0,
    minutes,
    stepOf: new Map(memory.map(m => [m.word, m.step])),
    lessonWord: new Map(lessons.map(l => [l.id, wordKey(l.title)]).filter(([, w]) => w)),
    vacation: vacationSince ? { since: vacationSince } : null,
    inMemory: memory.length,
    today: {
      picked, cards, minutes: sessionMinutes(cards + (ready ? 1 : 0)), shown,
      phrase: ready ? { id: ready.id, title: ready.title, videoUrl: ready.videoUrl } : null,
    },
    next,
    ladder: buildLadder(memory, { todayWords: new Set(picked.map(p => p.word)), hasDeck, wordHome }),
    week: weekSummary(reviews, today),
    phrases,
    known: memory.filter(m => m.step >= KNOW_STEP).length,
    strongPhrases: phrases.filter(p => p.golden).length,
  }
}

// Итоги недели (пассивные — PROJECT.md → «Вкладки»): за последние 7 дней —
// дней с повторением, слов повторено, слов окрепло (сессии и «Помнишь?» в
// ленте); prevGrew — окрепло неделей раньше (дни 8–14) для сравнения, null —
// тогда не повторял. today не задан — весь журнал считается текущей неделей
export function weekSummary(reviews, today = null) {
  const rs = (reviews ?? []).filter(r => r.source === 'review' || r.source === 'feed')
  const weekStart = today ? addDaysIso(today, -6) : ''
  const cur = rs.filter(r => localDate(r.created_at) >= weekStart)
  const prev = today ? rs.filter(r => localDate(r.created_at) < weekStart && localDate(r.created_at) >= addDaysIso(today, -13)) : []
  const grewOf = list => new Set(list.filter(r => (r.step_after ?? 0) > (r.step_before ?? 0)).map(r => r.word)).size
  return {
    days: new Set(cur.map(r => localDate(r.created_at))).size,
    words: new Set(cur.map(r => r.word)).size,
    grew: grewOf(cur),
    prevGrew: prev.length ? grewOf(prev) : null,
  }
}

function addDaysIso(date, n) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

// Через сколько дней срок: 'сегодня' | 'завтра' | 'через 3 дня'
export function dueLabel(due, today) {
  if (!due) return ''
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'завтра'
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`
}
