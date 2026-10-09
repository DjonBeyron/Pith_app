// Чистый автомат панели «Сказать фразу» (reducer): как контроллер распознавания (speechController) и тапы ученика
// переводят панель между состояниями. Без React и без побочных эффектов — поэтому покрыт тестами; события аналитики и
// флаги разрешений снимает с результата хук useSayPhrase.js.
//
// phase: idle (готов) | explain (пояснение перед самым первым запросом) | run (запись/ожидание) |
//        passed (прошло порог) | failed (не прошло/ошибка) | fallback (микрофона не будет, см. fallbackReason)
import { emptyView } from './speechController.js'
import { judgeRun, interimDiffers, SAY_EVENTS, MAX_TAPS } from './sayResult.js'
import { isDeniedCode } from './sayTexts.js'

export { SAY_PANEL_DELAY_MS, SAY_PANEL_DELAY_NO_PHRASE_MS, panelDelayMs } from './sayPanelDelay.js' // пауза перед подъёмом панели

export function initialSayState(decision) {
  const base = {
    phase: 'idle', taps: 0, view: emptyView, verdict: null, errorCode: null, fallbackReason: null, autoRetries: 0,
    explainer: false, data: null, settledRun: 0, event: null,
  }
  return decision?.action === 'fallback' ? { ...base, phase: 'fallback', fallbackReason: decision.reason } : base
}

// Итог захода (контроллер дошёл до done/error): passed / failed / fallback(denied)
function settle(s, v) {
  const autoRetries = Math.max(0, (v.attempt ?? 1) - 1)
  const mark = { settledRun: v.runNo, autoRetries, view: v }
  const ev = (extra) => ({ name: SAY_EVENTS.result, extra: { autoRetries, ...extra }, n: (s.event?.n ?? 0) + 1 })
  if (v.status === 'error') {
    if (isDeniedCode(v.error)) {
      return { ...s, ...mark, phase: 'fallback', fallbackReason: 'denied', verdict: null, errorCode: null, event: ev({ passed: false, reason: 'denied' }) }
    }
    return { ...s, ...mark, phase: 'failed', verdict: null, errorCode: v.error, event: ev({ passed: false, reason: v.error }) }
  }
  if (!v.final) { // остановили до речи / ничего не распознано: для ученика это «не слышу речь»
    return { ...s, ...mark, phase: 'failed', verdict: null, errorCode: 'no-speech', event: ev({ passed: false, reason: 'no-speech' }) }
  }
  const verdict = judgeRun(v, s.data)
  return {
    ...s, ...mark, phase: verdict.passed ? 'passed' : 'failed', verdict, errorCode: null,
    event: ev({ passed: verdict.passed, ratioPct: verdict.ratioPct, interimDiffers: interimDiffers(v.lastInterim, v.final?.text) }),
  }
}

export function sayReducer(s, a) {
  switch (a.type) {
    case 'view': {
      const v = a.view
      const terminal = v.status === 'done' || v.status === 'error'
      // Итог обрабатываем один раз на заход; события чужого/прерванного захода (phase не run) игнорируем
      if (terminal && v.runNo !== s.settledRun && s.phase === 'run') return settle(s, v)
      if (s.phase !== 'run' && v.status !== 'idle') return s
      return { ...s, view: v }
    }
    case 'begin': return { ...s, phase: 'run', taps: s.taps + 1, verdict: null, errorCode: null, data: a.data }
    case 'explain': return { ...s, phase: 'explain', explainer: true }
    case 'explainCancel': return s.phase === 'explain' ? { ...s, phase: 'idle' } : s // закрыли попап мимо кнопки: ничего не просили, флаг пояснения не ставим
    case 'fallback': return a.onlyIdle && s.phase !== 'idle' ? s : { ...s, phase: 'fallback', fallbackReason: a.reason }
    case 'enable': return { ...s, phase: 'idle', fallbackReason: null }
    // Запись прервали (сворачивание/уход со страницы): попытка не тратится, панель снова готова
    case 'interrupt':
      return s.phase === 'run' ? { ...s, phase: 'idle', taps: Math.max(0, s.taps - 1), view: emptyView } : s
    default: return s
  }
}

/**
 * Что делать по тапу на микрофон (чистое решение; start() зовёт только 'begin').
 *  stop — идёт запись: тап = «стоп» (принять сказанное); ignore — ждём диалог ОС/обработку или попытки кончились;
 *  fallback — микрофона не будет (start() НЕ вызываем); explain — пояснение; begin — start() прямо в этом тапе
 * decision — результат sayPermission.decide()
 */
export function planTap({ view, taps, decision }) {
  const status = view?.status
  if (status === 'starting' || status === 'listening' || status === 'retrying') {
    return { act: status === 'listening' ? 'stop' : 'ignore' }
  }
  if (taps >= MAX_TAPS) return { act: 'ignore' }
  if (decision.action === 'fallback') return { act: 'fallback', reason: decision.reason }
  if (decision.action === 'explain') return { act: 'explain' }
  return { act: 'begin' }
}
