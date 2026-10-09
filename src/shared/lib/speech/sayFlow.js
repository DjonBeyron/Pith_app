// Чистый автомат панели «Сказать фразу» (reducer): как контроллер распознавания (speechController) и тапы ученика
// переводят панель между состояниями. Без React и без побочных эффектов — поэтому покрыт тестами; события аналитики и
// флаги разрешений снимает с результата хук useSayPhrase.js.
//
// phase: idle (готов) | explain (пояснение перед самым первым запросом) | run (запись/ожидание) |
//        passed (прошло порог) | failed (не прошло/ошибка; микрофон снова доступен) | fallback (микрофона не будет, см. fallbackReason)
// Три точки после тапа (dots 1..3, потом dotsDone): таймер «начали», маскирует задержку старта распознавания; «начали» (isGo) —
// когда точки доиграли И движок уже слушает (audiostart).
import { emptyView } from './speechController.js'
import { judgeRun, interimDiffers, failReason, SAY_EVENTS } from './sayResult.js'
import { isDeniedCode } from './sayTexts.js'
import { adminHeardLine } from './sayAdmin.js'

export const DOT_MS = 350   // одна точка (всего три → «начали» через 1050 мс после тапа)
export const DOTS = 3

export function initialSayState(decision) {
  const base = {
    phase: 'idle', taps: 0, view: emptyView, verdict: null, errorCode: null, fallbackReason: null, autoRetries: 0,
    explainer: false, data: null, settledRun: 0, event: null, failStreak: 0, dots: 0, dotsDone: false, adminLine: null,
  }
  return decision?.action === 'fallback' ? { ...base, phase: 'fallback', fallbackReason: decision.reason } : base
}

// Итог захода (контроллер дошёл до done/error): passed / failed / fallback(denied)
function settle(s, v) {
  const autoRetries = Math.max(0, (v.attempt ?? 1) - 1)
  const mark = { settledRun: v.runNo, autoRetries, view: v }
  const ev = (extra) => ({ name: SAY_EVENTS.result, extra: { autoRetries, ...extra }, n: (s.event?.n ?? 0) + 1 })
  const failed = (errorCode, verdict) => {
    const failStreak = s.failStreak + 1
    const reason = failReason({ errorCode, verdict })
    return { ...s, ...mark, phase: 'failed', verdict, errorCode, failStreak, event: ev({ passed: false, reason, failStreak, ratioPct: verdict?.ratioPct, engineFixed: verdict?.engineFixed?.length || undefined }) }
  }
  if (v.status === 'error') {
    if (isDeniedCode(v.error)) {
      return { ...s, ...mark, phase: 'fallback', fallbackReason: 'denied', verdict: null, errorCode: null, event: ev({ passed: false, reason: 'denied' }) }
    }
    return failed(v.error, null)
  }
  if (!v.final) return failed('no-speech', null) // остановили до речи / ничего не распознано: для ученика это «не слышу вас»
  const verdict = judgeRun(v, s.data)
  if (!verdict.passed) return failed(null, verdict)
  return {
    ...s, ...mark, phase: 'passed', verdict, errorCode: null, failStreak: 0,
    event: ev({ passed: true, ratioPct: verdict.ratioPct, interimDiffers: interimDiffers(v.lastInterim, v.final?.text), engineFixed: verdict.engineFixed?.length || undefined }),
  }
}

// Строка админа остаётся прежней, пока новое состояние не даёт новой (очищает её только 'begin')
const withAdminLine = (prev, next) => ({
  ...next,
  adminLine: adminHeardLine({ isAdmin: true, phase: next.phase, view: next.view, verdict: next.verdict, errorCode: next.errorCode }) ?? prev.adminLine,
})

export function sayReducer(s, a) {
  switch (a.type) {
    case 'view': {
      const v = a.view
      const terminal = v.status === 'done' || v.status === 'error'
      // Итог обрабатываем один раз на заход; события чужого/прерванного захода (phase не run) игнорируем
      if (terminal && v.runNo !== s.settledRun && s.phase === 'run') return withAdminLine(s, settle(s, v))
      if (s.phase !== 'run' && v.status !== 'idle') return s
      if (v.status === 'idle') return { ...s, view: v } // сброс контроллера не стирает строку админа
      return withAdminLine(s, { ...s, view: v })
    }
    case 'begin': return { ...s, phase: 'run', taps: s.taps + 1, verdict: null, errorCode: null, data: a.data, dots: 1, dotsDone: false, adminLine: null }
    case 'dot': return s.phase === 'run' ? { ...s, dots: Math.max(s.dots, Math.min(DOTS, a.n)) } : s
    case 'dotsDone': return s.phase === 'run' ? { ...s, dots: DOTS, dotsDone: true } : s
    case 'explain': return { ...s, phase: 'explain', explainer: true }
    case 'explainCancel': return s.phase === 'explain' ? { ...s, phase: 'idle' } : s // закрыли попап мимо кнопки: ничего не просили, флаг пояснения не ставим
    case 'fallback': return a.onlyIdle && s.phase !== 'idle' ? s : { ...s, phase: 'fallback', fallbackReason: a.reason }
    case 'enable': return { ...s, phase: 'idle', fallbackReason: null }
    // Запись прервали (сворачивание/уход со страницы): попытка не тратится, панель снова готова
    case 'interrupt':
      return s.phase === 'run' ? { ...s, phase: 'idle', taps: Math.max(0, s.taps - 1), view: emptyView, dots: 0, dotsDone: false } : s
    default: return s
  }
}

/** «Начали»: точки доиграли И распознавание слушает. Повторные автопопытки (attempt > 1) точки не повторяют — ждут только audiostart */
export const isGo = s => s.phase === 'run' && s.view?.status === 'listening' && (s.dotsDone || (s.view.attempt ?? 1) > 1)

/**
 * Что делать по тапу на микрофон (чистое решение; start() зовёт только 'begin').
 *  stop — «начали» и идёт запись: тап = «стоп» (принять сказанное); ignore — ждём точки/диалог ОС/обработку;
 *  fallback — микрофона не будет (start() НЕ вызываем); explain — пояснение; begin — start() прямо в этом тапе
 * decision — результат sayPermission.decide(); go — isGo(state). Число попыток не ограничено: после неудачи микрофон снова доступен
 */
export function planTap({ view, decision, go = false }) {
  const status = view?.status
  if (status === 'starting' || status === 'listening' || status === 'retrying') {
    return { act: status === 'listening' && go ? 'stop' : 'ignore' }
  }
  if (decision.action === 'fallback') return { act: 'fallback', reason: decision.reason }
  if (decision.action === 'explain') return { act: 'explain' }
  return { act: 'begin' }
}
