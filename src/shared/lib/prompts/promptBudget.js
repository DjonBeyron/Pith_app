import {
  PRIORITY, KINDS, MIN_SLIDES_BETWEEN, MAX_ABOUT_PERSON_PER_SESSION, EARLY_SESSIONS, MAX_PER_SESSION_EARLY, MAX_PER_SESSION,
  MIN_MS_AFTER_OPEN, DISMISS_PAUSE_MS, HINT_IGNORE_LIMIT, LATER_PAUSE_MS, LATER_STREAK_LIMIT, LATER_LONG_MS,
  AUTO_OFF_MIN_SHOWN, AUTO_OFF_DISMISS_SHARE,
} from './promptRules.js'

// Единый бюджет вопросов Пита: чистые функции над состоянием (без localStorage и React), время `now` — аргументом.
// Каждая функция возвращает НОВОЕ состояние, входное не меняет. Хранение — promptStore.js.
//
// Состояние (всё JSON-совместимо, лежит в localStorage устройства):
//   sessions       — сколько сессий было (startSession +1); первые EARLY_SESSIONS строже
//   sessionAt      — время входа текущей сессии (мс); 0 — сессия не начата
//   slide          — сколько слайдов просмотрено в этой сессии (onSlide)
//   lastSlide      — на каком значении slide был последний показ в этой сессии (null — ещё не показывали)
//   shownSession   — что показано в этой сессии: [{ id, kind, at }]
//   aboutPerson    — сколько вопросов «про человека» показано в этой сессии
//   pausedKinds    — { [kind]: untilTs } пауза вида после повторных закрытий
//   dismissStreak  — { [kind]: n } сколько раз подряд вид закрыли без ответа (ответ обнуляет)
//   hintIgnored    — { [hintId]: n } сколько раз подсказку проигнорировали; ≥ HINT_IGNORE_LIMIT — снята навсегда
//   laterStreak    — «Спроси позже» подряд; laterUntil — до какого момента пауза всех шторок (мс), 0 — нет
//   stats          — { [kind]: { shown, dismissed } } за всё время (для самовыключения вида)
//   offKinds       — { [kind]: true } вид выключился сам (доля закрытий высокая); обратно — только вручную
// Кандидат: { id, kind, reason, aboutPerson? }. Контекст: { now, busy: { audio, input, afterError, afterDontKnow } }.

const MAX_HINT_IDS = 200 // страховка от разрастания hintIgnored
const isObj = v => v && typeof v === 'object' && !Array.isArray(v)
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const count = v => Math.max(0, Math.floor(num(v)))

export const emptyState = () => ({
  sessions: 0, sessionAt: 0, slide: 0, lastSlide: null, shownSession: [], aboutPerson: 0,
  pausedKinds: {}, dismissStreak: {}, hintIgnored: {}, laterStreak: 0, laterUntil: 0, stats: {}, offKinds: {},
})

// Сырое из хранилища → корректное состояние (битое и лишнее отбрасывается, недостающее — по умолчанию)
export function normalizeState(raw) {
  const s = isObj(raw) ? raw : {}
  const pick = (v, ok) => Object.fromEntries(Object.entries(isObj(v) ? v : {}).filter(([, x]) => ok(x)))
  return {
    sessions: count(s.sessions),
    sessionAt: num(s.sessionAt),
    slide: count(s.slide),
    lastSlide: typeof s.lastSlide === 'number' && Number.isFinite(s.lastSlide) ? s.lastSlide : null,
    shownSession: (Array.isArray(s.shownSession) ? s.shownSession : []).filter(x => isObj(x) && typeof x.id === 'string'),
    aboutPerson: count(s.aboutPerson),
    pausedKinds: pick(s.pausedKinds, x => typeof x === 'number'),
    dismissStreak: pick(s.dismissStreak, x => Number.isInteger(x) && x > 0),
    hintIgnored: Object.fromEntries(Object.entries(pick(s.hintIgnored, x => Number.isInteger(x) && x > 0)).slice(-MAX_HINT_IDS)),
    laterStreak: count(s.laterStreak),
    laterUntil: num(s.laterUntil),
    stats: pick(s.stats, isObj),
    offKinds: pick(s.offKinds, x => x === true),
  }
}

// Новая сессия (вход в приложение): счётчики сессии с нуля. Паузы, «игнор» подсказок и статистика живут между сессиями
export const startSession = (state, now) => ({
  ...state, sessions: state.sessions + 1, sessionAt: now, slide: 0, lastSlide: null, shownSession: [], aboutPerson: 0,
})

// Ещё один слайд ленты. Считаем смены слайда, а не номер: возврат назад тоже «новый» слайд. Нечисловой индекс игнорируется
export const onSlide = (state, slideIndex) => (
  Number.isFinite(slideIndex) ? { ...state, slide: state.slide + 1 } : state
)

const maxPerSession = state => (state.sessions <= EARLY_SESSIONS ? MAX_PER_SESSION_EARLY : MAX_PER_SESSION)

// Почему кандидата показать нельзя (строка по-русски) или null — можно. Порядок проверок задан планом A1
export function blockReason(state, candidate, ctx) {
  const { now, busy = {} } = ctx
  const { id, kind } = candidate
  if (state.offKinds[kind]) return 'вид выключен: его слишком часто закрывали'
  if (kind === KINDS.hint && (state.hintIgnored[id] ?? 0) >= HINT_IGNORE_LIMIT) return 'подсказка снята навсегда: её игнорировали'
  if ((state.pausedKinds[kind] ?? 0) > now) return 'вид на паузе после повторных закрытий'
  if (state.laterUntil > now) return 'пауза после «Спроси позже»'
  if (busy.audio) return 'сейчас звучит звук'
  if (busy.input) return 'человек вводит текст'
  if (busy.afterError) return 'только что была ошибка'
  if (busy.afterDontKnow) return 'только что нажали «Не знаю»'
  if (state.sessionAt && now - state.sessionAt < MIN_MS_AFTER_OPEN) return 'рано: прошло меньше 20 с после входа'
  if (state.shownSession.length >= maxPerSession(state)) return `лимит: за сессию уже показано ${state.shownSession.length} из ${maxPerSession(state)}`
  if (candidate.aboutPerson && state.aboutPerson >= MAX_ABOUT_PERSON_PER_SESSION) return 'вопрос «про человека» в этой сессии уже был'
  if (state.shownSession.length && state.lastSlide != null && state.slide - state.lastSlide < MIN_SLIDES_BETWEEN) {
    return `лимит: не прошло ${MIN_SLIDES_BETWEEN} слайдов с прошлого показа`
  }
  return null
}

export const canShow = (state, candidate, ctx) => blockReason(state, candidate, ctx) === null

// Лучший из разрешённых по PRIORITY (равные — первый в списке); неизвестная категория — в самый конец; нет разрешённых — null
export function pickNext(state, candidates, ctx) {
  let best = null
  let bestRank = Infinity
  for (const c of candidates) {
    if (!canShow(state, c, ctx)) continue
    const i = PRIORITY.indexOf(c.reason)
    const rank = i < 0 ? PRIORITY.length : i
    if (rank < bestRank) { best = c; bestRank = rank }
  }
  return best
}

const bumpStat = (stats, kind, field) => ({
  ...stats, [kind]: { shown: 0, dismissed: 0, ...stats[kind], [field]: (stats[kind]?.[field] ?? 0) + 1 },
})

// Записать показ
export const noteShown = (state, candidate, now) => ({
  ...state,
  shownSession: [...state.shownSession, { id: candidate.id, kind: candidate.kind, at: now }],
  lastSlide: state.slide,
  aboutPerson: state.aboutPerson + (candidate.aboutPerson ? 1 : 0),
  stats: bumpStat(state.stats, candidate.kind, 'shown'),
})

// Ответил: закрытия подряд этого вида и «позже» подряд обрываются
export const noteAnswer = (state, candidate) => ({
  ...state, dismissStreak: { ...state.dismissStreak, [candidate.kind]: 0 }, laterStreak: 0,
})

// Закрыл/смахнул: 2-е закрытие подряд — пауза вида 7 суток, 3-е и дальше — 30; игнор подсказки; самовыключение вида
export function noteDismiss(state, candidate, now) {
  const { kind, id } = candidate
  const streak = (state.dismissStreak[kind] ?? 0) + 1
  const pauseMs = streak >= 2 ? DISMISS_PAUSE_MS[Math.min(streak, 3)] : 0
  const stats = bumpStat(state.stats, kind, 'dismissed')
  const { shown, dismissed } = stats[kind]
  const off = shown >= AUTO_OFF_MIN_SHOWN && dismissed / shown >= AUTO_OFF_DISMISS_SHARE
  return {
    ...state,
    dismissStreak: { ...state.dismissStreak, [kind]: streak },
    pausedKinds: pauseMs ? { ...state.pausedKinds, [kind]: now + pauseMs } : state.pausedKinds,
    hintIgnored: kind === KINDS.hint ? { ...state.hintIgnored, [id]: (state.hintIgnored[id] ?? 0) + 1 } : state.hintIgnored,
    stats,
    offKinds: off ? { ...state.offKinds, [kind]: true } : state.offKinds,
  }
}

// «Спроси позже»: пауза всех шторок 3 часа; третье подряд — 7 суток и счёт с нуля. Закрытием и ответом не считается
export function noteLater(state, _candidate, now) {
  const n = state.laterStreak + 1
  const long = n >= LATER_STREAK_LIMIT
  return { ...state, laterStreak: long ? 0 : n, laterUntil: now + (long ? LATER_LONG_MS : LATER_PAUSE_MS) }
}

// Чистка истёкших пауз (счётчики закрытий и «игнор подсказок» живут дальше — они не про время)
export function prune(state, now) {
  const pausedKinds = Object.fromEntries(Object.entries(state.pausedKinds).filter(([, until]) => until > now))
  return { ...state, pausedKinds, laterUntil: state.laterUntil > now ? state.laterUntil : 0 }
}
