import { seededUnit } from './seeded.js'
import { FUTURE_SIGNALS } from './signalCatalogFuture.js'

// Реестр сигналов ранжирования ленты (этап 1 движка, PROJECT.md → «Движок
// сигналов ленты»). Сигнал — чистая функция compute(ctx, item) → { value 0..1,
// reason? }: 1 — фраза «просится» вверх, 0 — вниз. Веса и тумблеры — в конфиге
// (feedConfig.js), складывает — rankWeighted.js.
//
// ctx  — общий на весь список: { stepOf, skipped, skippedWords, seed, count,
//        minDifficultyVotes } (собирает rankWeighted.buildItems из rank-объекта ленты).
// item — один модуль: { module, index, words, info } — words — слова-уроки фразы,
//        info — { total, newWords[], shaky[] } (как phraseInfo в feedKnowledge.js).
//
// status: 'live' — считается сейчас; 'collecting' — данные уже пишутся (журнал
// app_events / таблицы), но сигнал пока нейтрален; 'planned' — только описание.
// В админке вес и тумблер доступны ТОЛЬКО live-сигналам (uiLocked = status !== 'live').

export const NEUTRAL = { value: 0.5 }
export const GROUPS = {
  memory: 'Память слов',
  behavior: 'Поведение в ленте',
  content: 'Содержание фразы',
  social: 'Реакции',
  mix: 'Разнообразие',
}

// Порог голосов сложности — как MIN_DIFFICULTY_VOTES в shared/api/difficultyApi.js
// (сюда не импортируем: реестр — чистый, без клиента Supabase). Лента передаёт
// актуальное значение через ctx.minDifficultyVotes
const DEFAULT_MIN_VOTES = 5

const LIVE_SIGNALS = [
  {
    id: 'memory_fit',
    title: 'Зона памяти',
    description: 'Насколько фраза в «зоне ближайшего развития»: есть шатающееся слово (уровень 1 «Новые», шаг < 3) или не больше двух временных (ещё нет в памяти, уровень 0) при остальных знакомых и выше (уровни 2–4) — вверх; все слова временные — вниз; фраза без слов-уроков — посередине. Пока память пуста (холодный старт) — нейтрально.',
    group: 'memory',
    source: 'word_memory (шаги слов) + lesson_ids модуля',
    status: 'live',
    defaultWeight: 60,
    defaultEnabled: true,
    compute(ctx, item) {
      if (!ctx.stepOf?.size) return { value: 0.5, reason: 'память пуста' }
      const { words, info } = item
      if (!words.length) return { value: 1 / 3, reason: 'нет слов-уроков' }
      if (info.newWords.length === words.length) return { value: 0, reason: 'все слова временные' }
      if (info.shaky.length) return { value: 1, reason: `шатается: ${info.shaky.slice(0, 2).join(', ')}` }
      if (info.newWords.length <= 2) return { value: 1, reason: `временных слов: ${info.newWords.length}` }
      return { value: 2 / 3, reason: `временных слов: ${info.newWords.length}` }
    },
  },
  {
    id: 'quick_skip_penalty',
    title: 'Быстрый пролист',
    description: 'Фраза, которую пролистали быстрее 2 секунд, и фразы с общим с ней словом — ниже. Хранится на устройстве 14 дней.',
    group: 'behavior',
    source: 'localStorage pithy_feed_skips_v1 (feedSkips.js)',
    status: 'live',
    defaultWeight: 20,
    defaultEnabled: true,
    compute(ctx, item) {
      if (ctx.skipped?.has(item.module.id)) return { value: 0, reason: 'пролистана быстро' }
      const w = item.words.find(x => ctx.skippedWords?.has(x))
      if (w) return { value: 0, reason: `похожа на пролистанную (${w})` }
      return { value: 1 }
    },
  },
  {
    id: 'difficulty_fit',
    title: 'Сложность',
    description: 'Проще — раньше. Сложность — медиана голосов 1/2/3; пока голосов меньше порога, фраза считается лёгкой.',
    group: 'content',
    source: 'curricula.difficulty / difficulty_votes',
    status: 'live',
    defaultWeight: 8,
    defaultEnabled: true,
    compute(ctx, item) {
      const m = item.module
      const minVotes = ctx.minDifficultyVotes ?? DEFAULT_MIN_VOTES
      const level = (m.difficultyVotes ?? 0) >= minVotes ? Number(m.difficulty) || 1 : 1
      return { value: (3 - Math.min(3, Math.max(1, level))) / 2, reason: ['', 'легко', 'средне', 'сложно'][level] }
    },
  },
  {
    id: 'admin_order',
    title: 'Порядок админа',
    description: 'Порядок модулей, заданный в админке: чем раньше — тем выше. При равных остальных сигналах решает он.',
    group: 'content',
    source: 'порядок строк curricula',
    status: 'live',
    defaultWeight: 6,
    defaultEnabled: true,
    compute(ctx, item) {
      const n = Math.max(1, (ctx.count ?? 1) - 1)
      return { value: 1 - item.index / n }
    },
  },
  {
    id: 'random_mix',
    title: 'Случайная подмешка',
    description: 'Личный жребий фразы на день: лёгкая встряска порядка, чтобы лента не замыкалась на одном и том же. Стабилен в течение дня.',
    group: 'mix',
    source: 'сид дня (daySeed) + id модуля',
    status: 'live',
    defaultWeight: 3,
    defaultEnabled: true,
    compute(ctx, item) {
      return { value: seededUnit(ctx.seed ?? 1, item.module.id) }
    },
  },
]

export const SIGNALS = [...LIVE_SIGNALS, ...FUTURE_SIGNALS]

const byId = new Map(SIGNALS.map(s => [s.id, s]))
export const signalById = id => byId.get(id) ?? null
export const liveSignals = () => SIGNALS.filter(s => s.status === 'live')
export const isLiveSignal = id => byId.get(id)?.status === 'live'

// Метаданные для админки (этап 2): без compute, с флагом «нельзя включить»
export const signalMeta = () => SIGNALS.map(s => {
  const meta = { ...s, groupTitle: GROUPS[s.group] ?? s.group, uiLocked: s.status !== 'live' }
  delete meta.compute
  return meta
})
