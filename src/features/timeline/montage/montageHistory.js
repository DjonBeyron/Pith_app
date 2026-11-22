// История черновика правок монтажа: отмена и возврат БЕЗ ограничения «один шаг», хранение черновика в localStorage по id прохождения. Чистые функции без React.
// История — { past: [список правок, …], now: список правок, future: [список правок, …] }. Каждое состояние — целый неизменяемый список (правок десятки — это дёшево), поэтому отмена не «откатывает действие»,
// а просто возвращает прежний список: ошибиться нечем. «Убрать правку» и «сбросить всё» — такие же шаги истории: их тоже можно отменить.
// Черновик в хранилище — { v: 1, run (id прохождения), savedAt (ISO), edits, past, future }: после закрытия экрана и перезагрузки страницы возвращается и список, и вся история отмены.
// На сервер (shared/api/timelineApi.js, runs[i].edits) уходит короткая форма без истории: { v: 1, savedAt, edits }.
export const HISTORY_MAX = 300      // шагов отмены храним не больше (старые отбрасываются)
export const DRAFT_PREFIX = 'pithy.timeline.edits.'
export const DRAFTS_KEEP = 20       // черновиков разных прохождений в хранилище — не больше (старые удаляются)

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const okEdit = e => !!e && typeof e.key === 'string' && Number.isFinite(e.to) && Number.isFinite(e.from)
const list = v => (Array.isArray(v) ? v.filter(okEdit) : [])

export const hInit = (edits = []) => ({ past: [], now: list(edits), future: [] })
/** Новый шаг: список правок стал таким (тот же список — шага нет); будущее (возврат) сбрасывается */
export const hPush = (h, edits) => (same(h.now, edits) ? h : { past: [...h.past, h.now].slice(-HISTORY_MAX), now: edits, future: [] })
export const hUndo = h => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h)
export const hRedo = h => (h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h)
export const canUndo = h => h.past.length > 0
export const canRedo = h => h.future.length > 0

/** История → запись для хранилища */
export const serialize = (h, run, now = new Date()) => ({ v: 1, run, savedAt: now.toISOString(), edits: h.now, past: h.past, future: h.future })
/** Короткая форма для сервера (без истории отмены) */
export const serverDraft = (h, now = new Date()) => ({ v: 1, savedAt: now.toISOString(), edits: h.now })

/** Запись хранилища / сервера → { h, savedAt } или null (битая, чужой формат) */
export function restore(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.edits)) return null
  const steps = v => (Array.isArray(v) ? v.filter(Array.isArray).map(list) : [])
  return { h: { past: steps(obj.past).slice(-HISTORY_MAX), now: list(obj.edits), future: steps(obj.future) }, savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : '' }
}

/** Хранилище браузера, которое не бросает (приватный режим, переполнение): { get, set, del, keys } */
export function safeStore(ls = globalThis.localStorage) {
  return {
    get: k => { try { return ls?.getItem(k) ?? null } catch { return null } },
    set: (k, v) => { try { ls?.setItem(k, v); return true } catch { return false } },
    del: k => { try { ls?.removeItem(k) } catch { /* хранилища нет */ } },
    keys: () => { try { return Array.from({ length: ls?.length ?? 0 }, (_, i) => ls.key(i)).filter(Boolean) } catch { return [] } },
  }
}

export const draftKey = run => `${DRAFT_PREFIX}${run}`

/** Черновик прохождения run из хранилища → { h, savedAt } или null */
export function loadDraft(store, run) {
  if (!store || !run) return null
  try { return restore(JSON.parse(store.get(draftKey(run)) ?? 'null')) } catch { return null }
}

/** Записать черновик (сразу после каждого шага). → true, если записалось. Лишние черновики старых прохождений удаляются */
export function saveDraft(store, run, h, now = new Date()) {
  if (!store || !run) return false
  const ok = store.set(draftKey(run), JSON.stringify(serialize(h, run, now)))
  const mine = store.keys().filter(k => k.startsWith(DRAFT_PREFIX))
  if (mine.length > DRAFTS_KEEP) {
    const when = k => { try { return JSON.parse(store.get(k))?.savedAt ?? '' } catch { return '' } }
    mine.map(k => [k, when(k)]).sort((a, b) => (a[1] < b[1] ? -1 : 1)).slice(0, mine.length - DRAFTS_KEEP).forEach(([k]) => { if (k !== draftKey(run)) store.del(k) })
  }
  return ok
}

/** Из двух черновиков (устройство и сервер) — тот, что записан позже («последний записавший прав»); null — нет ни одного */
export function newest(a, b) {
  if (!a || !b) return a ?? b ?? null
  return (b.savedAt || '') > (a.savedAt || '') ? b : a
}
