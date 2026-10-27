import { QUEUE_TTL_MS, MAX_QUEUE, MIN_MS_AFTER_OPEN } from './promptRules.js'
import { startSession, onSlide, pickNext, noteShown, noteAnswer, noteDismiss, noteLater } from './promptBudget.js'
import { PROMPT_SHOWN, PROMPT_ANSWER, PROMPT_DISMISS } from '../analytics/eventNames.js'

// «Слот» шторки Пита без React: одна показанная шторка (current) и очередь ожидающих кандидатов. Хук usePromptSlot.js —
// тонкая обёртка (useSyncExternalStore), поэтому всё поведение проверяется обычными тестами без DOM.
// Зависимости передаются снаружи (load/save — promptStore, track — analytics/track, now/таймеры), чтобы подменять в тестах.
// Пока показан один, второй ждёт; после answer/dismiss/later очередь пробуется снова. Кандидат живёт в очереди QUEUE_TTL_MS.
// Попытка показа повторяется при request, onSlide, setBusy и по таймеру, когда истекают 20 с после входа.
// allow(candidate) — фильтр допуска (контрольная группа без «умных» вопросов, promptGroup.js): отклонённый кандидат молча
// отбрасывается в request и в очередь не попадает. extra() — плоские props (напр. { group }), которые подмешиваются во все три события.

// Ответ в props события: только плоское и короткое (в журнале нет текста пользователя)
const flat = v => (typeof v === 'number' || typeof v === 'boolean' ? v : String(v ?? '').slice(0, 64))

export function createPromptSlot({
  load, save, track, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  allow = () => true, extra = () => ({}),
}) {
  let state = load(now())
  let queue = [] // [{ candidate, at }]
  let current = null
  let shownAt = 0
  let started = false
  let timer = null
  let busy = { audio: false, input: false, afterError: false, afterDontKnow: false }
  const listeners = new Set()

  const commit = next => { state = next; save(state) }
  const emit = () => listeners.forEach(fn => fn())

  function tryPick() {
    if (current) return
    const t = now()
    queue = queue.filter(q => t - q.at < QUEUE_TTL_MS)
    if (!queue.length) return
    const chosen = pickNext(state, queue.map(q => q.candidate), { now: t, busy })
    if (chosen) {
      queue = queue.filter(q => q.candidate !== chosen)
      commit(noteShown(state, chosen, t))
      current = chosen
      shownAt = t
      track(PROMPT_SHOWN, { kind: chosen.kind, id: chosen.id, ...extra() })
      emit()
      return
    }
    // Пока ждём «20 с после входа» — проснёмся сами, события могут и не прийти
    const wait = state.sessionAt + MIN_MS_AFTER_OPEN - t
    if (wait > 0 && !timer) timer = setTimer(() => { timer = null; tryPick() }, wait + 50)
  }

  // Закрыть текущую шторку: apply — какая запись в бюджете, ev — событие
  function finish(apply, name, props) {
    if (!current) return
    const c = current
    const t = now()
    current = null
    commit(apply(state, c, t))
    track(name, { kind: c.kind, id: c.id, ...props, ...extra(), ms: t - shownAt })
    emit()
    tryPick()
  }

  return {
    getCurrent: () => current,
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    // Вход в приложение. Идемпотентна: повторный вызов (StrictMode, второй маунт хука) сессию не удваивает
    start() {
      if (started) { tryPick(); return }
      started = true
      commit(startSession(state, now()))
      tryPick()
    },
    request(candidate) {
      if (!candidate?.id || !candidate.kind) return
      if (!allow(candidate)) return
      if (current?.id === candidate.id || queue.some(q => q.candidate.id === candidate.id)) return
      queue = [...queue, { candidate, at: now() }].slice(-MAX_QUEUE)
      tryPick()
    },
    answer(value) { finish(noteAnswer, PROMPT_ANSWER, { answer: flat(value) }) },
    dismiss() { finish(noteDismiss, PROMPT_DISMISS, { later: false }) },
    later() { finish(noteLater, PROMPT_DISMISS, { later: true }) },
    onSlide(i) { commit(onSlide(state, i)); tryPick() },
    setBusy(partial) { busy = { ...busy, ...partial }; tryPick() },
    dispose() { if (timer) clearTimer(timer); timer = null }, // слушатели снимают сами подписчики
  }
}
