import { MSG_SLIDE_MS } from '../../PlayerFeed.jsx'

// Планирование старта сцены в ленте — без React, чтобы тестировать как чистую
// логику (sceneStartPlan.test.js). Порядок:
//  1. startDecision — стартовать ли вообще: 'skip' (вручную / история / нет
//     сцены), 'wait' (нода предрисована за экраном, pending — ждём показа),
//     'arm' (нода показана — планируем);
//  2. waitRowAppear — конец анимации появления сообщения. Въезд строки — WAAPI
//     (PlayerFeed.jsx: row.animate(..., MSG_SLIDE_MS)), DOM-событий animationend
//     у него нет, поэтому ждём getAnimations().finished; нет анимаций (режим
//     чтения истории, data-no-slide) и через кадр не появилась → таймер на ту
//     же длительность MSG_SLIDE_MS (константа ленты, не догадка);
//     prefers-reduced-motion → анимации нет, ждать нечего;
//  3. scheduleSceneStart — после появления выждать startDelayMs ноды, а если
//     вкладка скрыта — дождаться visibilitychange; play() ровно один раз,
//     cancel() обрывает любой этап.

export const APPEAR_FALLBACK_MS = MSG_SLIDE_MS
export const APPEAR_ROW_SELECTOR = '.playerMsgRow'

export function startDecision({ start, isHistory, pending, hasScene = true }) {
  if (!hasScene || isHistory || start !== 'auto') return 'skip'
  return pending ? 'wait' : 'arm'
}

export function prefersReducedMotion(win = typeof window !== 'undefined' ? window : null) {
  try { return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches } catch { return false }
}

// Идущие анимации строки сообщения (и только её: анимация обёртки ленты — тот же срок)
export function runningAnimations(el) {
  const row = el?.closest?.(APPEAR_ROW_SELECTOR) ?? el
  if (!row?.getAnimations) return []
  try { return row.getAnimations().filter(a => a.playState === 'running' || a.playState === 'pending') } catch { return [] }
}

// Promise конца анимации появления. env — для тестов (raf/таймеры), по умолчанию браузер
export function waitRowAppear(el, {
  reducedMotion = prefersReducedMotion(), fallbackMs = APPEAR_FALLBACK_MS,
  raf = cb => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 16)),
  timers = globalThis, onResolved = () => {},
} = {}) {
  let cancelled = false
  const cancel = () => { cancelled = true }
  const promise = new Promise(resolve => {
    const done = how => { if (!cancelled) { onResolved(how); resolve(how) } }
    if (reducedMotion) { done('reduced-motion'); return }
    const anims = runningAnimations(el)
    if (anims.length) { Promise.all(anims.map(a => a.finished)).then(() => done('animation'), () => done('animation')); return }
    // Эффект мог сработать до того, как лента завела анимацию — заглянем через кадр
    raf(() => {
      if (cancelled) return
      const late = runningAnimations(el)
      if (late.length) { Promise.all(late.map(a => a.finished)).then(() => done('animation'), () => done('animation')); return }
      timers.setTimeout(() => done('timer'), fallbackMs)
    })
  })
  return { promise, cancel }
}

// Полный план: появление → задержка → видимость → play() один раз. Возвращает cancel()
export function scheduleSceneStart({
  waitAppear, delayMs = 0, play, log = () => {},
  isHidden = () => (typeof document !== 'undefined' && document.hidden),
  onVisible = cb => {
    if (typeof document === 'undefined') return () => {}
    const h = () => { if (!document.hidden) cb() }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  },
  timers = globalThis,
}) {
  let cancelled = false
  let timer = null
  let unsub = null
  let played = false
  const fire = () => {
    if (cancelled || played) return
    if (isHidden()) {
      log('скрытая вкладка — старт отложен до возврата')
      unsub = onVisible(() => { unsub?.(); unsub = null; fire() })
      return
    }
    played = true
    log('старт')
    play()
  }
  waitAppear.promise.then(how => {
    if (cancelled) return
    log(`появление завершено (${how}) → задержка ${delayMs} мс`)
    timer = timers.setTimeout(fire, Math.max(0, delayMs))
  })
  return () => {
    cancelled = true
    waitAppear.cancel?.()
    if (timer != null) timers.clearTimeout(timer)
    unsub?.()
  }
}

// Автозапуск со звуком можно, если пользователь уже взаимодействовал со страницей
// (иначе <audio>/speechSynthesis откажут — политика автоплея) и урок не «без звука».
// Нет API userActivation — считаем, что можно (откажет — реплика уйдёт в таймер)
// needsGesture — звук сцен ещё не открыт жестом, а iOS открывает его только жестом (sceneAudioUnlock.sceneNeedsOwnGesture):
// автозапуск тогда идёт «без звука» с видимым чипом «Включить звук», а не молча «со звуком» (раньше кружок в начале урока молчал без подсказки)
export function autoStartSound({ muted = false, hasBeenActive = null, needsGesture = false } = {}) {
  if (muted) return false
  if (needsGesture) return false
  return hasBeenActive !== false
}

export function pageHasBeenActive(nav = typeof navigator !== 'undefined' ? navigator : null) {
  const ua = nav?.userActivation
  return ua ? !!ua.hasBeenActive : null
}

// Автозапуск, дождавшийся своего часа, не перебивает сцену, которой пользователь занялся, пока мы ждали:
// жест по другой сцене (тап → запуск ещё в пути) или запуск другой сцены, которая играет до сих пор
export function autoStartYields({ armedGesture = 0, gesture = 0, armedSeq, seq, busy }) {
  return gesture !== armedGesture || (seq !== armedSeq && !!busy)
}
