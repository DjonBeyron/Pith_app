import { QUEUE_TTL_MS } from '../../../shared/lib/prompts/promptRules.js'
import { PROMPT_SHOWN, PROMPT_ANSWER, PROMPT_DISMISS } from '../../../shared/lib/analytics/eventNames.js'

// «Провода» подсказок ленты по поведению без React (хук useBehaviorHints.js — тонкая обёртка): слушает журнал событий,
// кормит судью (behaviorHints.js), а когда тот называет подсказку — просит у единого бюджета Пита слот (slot.request).
// Показывает подсказку сама шторка (PromptSheet: у кандидата есть text/answers/reply). Зависимости подаются снаружи —
// так проверяется обычным тестом: getSlot() → слот бюджета или null, subscribe(fn) → отписка (analytics onTrack).
// Кандидат: id `hint:<id>`, kind 'hint', reason 'ui_hint' (без legacy — контрольная группа его не видит).
// Ответ «listen» у подсказки про звук включает звук (enableSound зовётся прямо в жесте тапа по кнопке шторки).

const KEY = id => `hint:${id}`

export function createHintRunner({
  judge, getSlot, enableSound, subscribe,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let pending = null     // id подсказки, которую просили у бюджета
  let pendingAt = 0
  let shown = false      // слот выбрал и показал её
  let timer = null
  let stop = null

  function release() { pending = null; shown = false }

  // Просьба к бюджету не вечна: слот держит кандидата в очереди QUEUE_TTL_MS, потом забывает — просим заново
  function expired(t) { return pending && !shown && t - pendingAt > QUEUE_TTL_MS }

  function evaluate() {
    clearTimer(timer)
    timer = null
    const slot = getSlot()
    if (!slot) return
    const t = now()
    if (expired(t)) release()
    if (pending) return
    const h = judge.next(t)
    if (h) {
      pending = h.id
      pendingAt = t
      shown = false
      slot.request({ ...h, id: KEY(h.id), kind: 'hint', reason: 'ui_hint', scope: 'feed' })
      return
    }
    const wait = judge.nextDeadline(t)
    if (wait != null) timer = setTimer(evaluate, wait + 20)
  }

  // Снять свою подсказку: из очереди, а показанную — закрыть (слот запишет ответ «left»)
  function withdraw(id) {
    if (pending !== id) return
    const slot = getSlot()
    release()
    slot?.cancel(KEY(id))
  }

  function onTrackEvent(name, props) {
    if (pending && props?.id === KEY(pending)) {
      if (name === PROMPT_SHOWN) { shown = true; judge.markShown(pending) }
      if (name === PROMPT_ANSWER || name === PROMPT_DISMISS) {
        const wantsSound = pending === 'sound' && props.answer === 'listen'
        release()
        if (wantsSound) enableSound()
      }
      return
    }
    judge.onEvent(name, props, now())
    evaluate()
  }

  return {
    evaluate,
    start() {
      stop = subscribe(onTrackEvent)
      return () => {
        stop?.()
        stop = null
        clearTimer(timer)
        timer = null
        if (pending) withdraw(pending)
      }
    },
    // Слайд сменился (idx < 0 — ленты на экране нет). Подсказка про фразу привязана к слайду — на другом она ни к чему
    onSlide(idx) {
      judge.onSlide(idx, now())
      if (idx < 0 && pending) withdraw(pending) // ушли с ленты — подсказка ленты на другой вкладке ни к чему (иначе висит везде)
      else withdraw('rub')
      evaluate()
    },
    // Звук ленты включён/выключен. Включили сами — «Послушаем?» (в очереди или на экране) убираем
    setSound(on) {
      judge.setSound(on, now())
      if (on) withdraw('sound')
      evaluate()
    },
  }
}
