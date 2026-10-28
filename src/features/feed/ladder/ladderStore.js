import { LADDER_KEY, LADDER_MIN_SESSIONS } from './ladderRules.js'

// Состояние лесенки в localStorage устройства (формат — ladderRules.js):
//   firstDay — день первой загрузки с этой версией ('YYYY-MM-DD'); лесенка бывает только в ДРУГОЙ день;
//   shownDay — день, когда лесенку поставили в ленту (перезагрузка в тот же день берёт те же фразы);
//   done     — лесенка пройдена (или исчерпала попытки): больше не показываем;
//   ids      — id фраз плана в порядке показа;
//   tries    — в скольких разных днях её уже показывали.
// Стиль — как levelStore.js: сбой хранилища (приватный режим, битый JSON) ничего не ломает.
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function normalizeLadder(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    firstDay: isDay(r.firstDay) ? r.firstDay : '',
    shownDay: isDay(r.shownDay) ? r.shownDay : '',
    done: r.done === true,
    ids: (Array.isArray(r.ids) ? r.ids : []).filter(x => typeof x === 'string').slice(0, 12),
    tries: Number.isInteger(r.tries) && r.tries > 0 ? r.tries : 0,
  }
}

// null — записи нет или firstDay не известен (старый пользователь либо первая загрузка)
export function loadLadder() {
  try {
    const raw = localStorage.getItem(LADDER_KEY)
    if (raw == null) return null
    const rec = normalizeLadder(JSON.parse(raw))
    return rec.firstDay ? rec : null
  } catch { return null }
}

export function saveLadder(rec) {
  try { localStorage.setItem(LADDER_KEY, JSON.stringify(normalizeLadder(rec))) } catch { /* приватный режим — лесенка не запомнится */ }
}

// Первый вызов на устройстве записывает firstDay. Если к этому моменту визитов уже два и больше — это старый
// пользователь (до лесенки), ему её не показываем: done = true
export function ensureLadder({ today, sessions }) {
  const rec = loadLadder()
  if (rec) return rec
  const fresh = normalizeLadder({ firstDay: today, done: sessions >= LADDER_MIN_SESSIONS })
  saveLadder(fresh)
  return fresh
}

// Лесенку поставили в ленту: запоминаем день и фразы. Новый день — это новая попытка (tries + 1)
export function markShown(plan, today) {
  const rec = loadLadder()
  if (!rec) return
  const sameDay = rec.shownDay === today
  saveLadder({ ...rec, shownDay: today, ids: plan.map(s => s.id), tries: sameDay ? rec.tries : rec.tries + 1 })
}

export function markDone() {
  const rec = loadLadder()
  if (rec && !rec.done) saveLadder({ ...rec, done: true })
}
