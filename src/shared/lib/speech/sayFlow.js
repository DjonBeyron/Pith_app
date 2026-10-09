// Чистый автомат панели «Сказать фразу» (reducer): как контроллер распознавания (speechController) и тапы ученика
// переводят панель между состояниями. Без React и без побочных эффектов — поэтому покрыт тестами; события аналитики и
// флаги разрешений снимает с результата хук useSayPhrase.js.
//
// phase: idle (готов) | explain (пояснение перед самым первым запросом) | run (запись/ожидание) |
//        passed (прошло порог) | failed (не прошло/ошибка; микрофон снова доступен) | fallback (микрофона не будет, см. fallbackReason)
// Морфинг кнопки в квадрат (sayMorph.js, MORPH_MS) — «горлышко» подготовки микрофона: движок стартует во время морфинга, а «начали»
// (isGo) наступает, когда И морфинг завершён (morphDone), И движок уже слушает (audiostart). audiostart раньше — ждём конец
// морфинга; позже — квадрат уже готов и держится в подготовке (кольца спокойно «дышат»), пока не придёт audiostart.
// Неудача кладёт в state.hint подсказку для чата (sayHints.js; null — отключена в ноде или ошибка требует действия пользователя) и
// включает failShow: квадрат-кнопка показывает крестик FAIL_HOLD_MS (таймер ставит хук), потом действие 'failEnd' → снова прямоугольник.
// explainKind — какой попап перед запросом микрофона (full | short, см. sayPermission.decideMic); realLevel — пометка для строки админа
// («вкл» / «выкл» / «ошибка …»: опциональный реальный уровень звука для колец, sayRealLevel.js).
import { emptyView } from './speechController.js'
import { judgeRun, interimDiffers, failReason, SAY_EVENTS } from './sayResult.js'
import { isDeniedCode } from './sayTexts.js'
import { adminHeardLine } from './sayAdmin.js'
import { buildHint } from './sayHints.js'

export function initialSayState(decision) {
  const base = {
    phase: 'idle', taps: 0, view: emptyView, verdict: null, errorCode: null, fallbackReason: null, autoRetries: 0,
    explainer: false, explainKind: null, failShow: false, realLevel: null, audioSession: null, data: null, settledRun: 0, event: null, failStreak: 0, morphDone: false, adminLine: null, hint: null, hintNo: 0,
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
    const h = buildHint(s.data, { errorCode, verdict })
    const hintNo = h ? s.hintNo + 1 : s.hintNo
    return {
      ...s, ...mark, phase: 'failed', failShow: true, verdict, errorCode, failStreak, hintNo, hint: h ? { ...h, n: hintNo } : null,
      event: ev({ passed: false, reason, failStreak, ratioPct: verdict?.ratioPct, engineFixed: verdict?.engineFixed?.length || undefined, hintKind: h?.kind }),
    }
  }
  if (v.status === 'error') {
    if (isDeniedCode(v.error)) {
      return { ...s, ...mark, phase: 'fallback', fallbackReason: 'denied', verdict: null, errorCode: null, hint: null, event: ev({ passed: false, reason: 'denied' }) }
    }
    return failed(v.error, null)
  }
  if (!v.final) return failed('no-speech', null) // остановили до речи / ничего не распознано: для ученика это «не слышу вас»
  const verdict = judgeRun(v, s.data)
  if (!verdict.passed) return failed(null, verdict)
  return {
    ...s, ...mark, phase: 'passed', verdict, errorCode: null, failStreak: 0, hint: null,
    event: ev({ passed: true, ratioPct: verdict.ratioPct, interimDiffers: interimDiffers(v.lastInterim, v.final?.text), engineFixed: verdict.engineFixed?.length || undefined }),
  }
}

// Строка админа остаётся прежней, пока новое состояние не даёт новой (очищает её только 'begin')
const withAdminLine = (prev, next) => ({
  ...next,
  adminLine: adminHeardLine({ isAdmin: true, phase: next.phase, view: next.view, verdict: next.verdict, errorCode: next.errorCode, realLevel: next.realLevel, audioSession: next.audioSession }) ?? prev.adminLine,
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
    case 'begin': return { ...s, phase: 'run', taps: s.taps + 1, verdict: null, errorCode: null, data: a.data, morphDone: false, failShow: false, realLevel: a.realLevel ?? null, audioSession: a.audioSession ?? null, adminLine: null, hint: null }
    case 'morphEnd': return s.phase === 'run' ? { ...s, morphDone: true } : s
    case 'failEnd': return s.failShow ? { ...s, failShow: false } : s
    case 'realStatus': return s.realLevel === a.status ? s : { ...s, realLevel: a.status }
    case 'explain': return { ...s, phase: 'explain', explainer: true, explainKind: a.kind === 'short' ? 'short' : 'full' }
    case 'explainCancel': return s.phase === 'explain' ? { ...s, phase: 'idle' } : s // закрыли попап мимо кнопки: ничего не просили, флаг пояснения не ставим
    case 'fallback': return a.onlyIdle && s.phase !== 'idle' ? s : { ...s, phase: 'fallback', fallbackReason: a.reason }
    case 'enable': return { ...s, phase: 'idle', fallbackReason: null }
    // Запись прервали (сворачивание/уход со страницы): попытка не тратится, панель снова готова
    case 'interrupt':
      return s.phase === 'run' ? { ...s, phase: 'idle', taps: Math.max(0, s.taps - 1), view: emptyView, morphDone: false, failShow: false } : s
    default: return s
  }
}

/** «Начали»: морфинг в квадрат завершён И распознавание слушает. Повторные автопопытки (attempt > 1) морфинга не повторяют — ждут только audiostart */
export const isGo = s => s.phase === 'run' && s.view?.status === 'listening' && (s.morphDone || (s.view.attempt ?? 1) > 1)

/**
 * Что делать по тапу на микрофон (чистое решение; start() зовёт только 'begin').
 *  stop — «начали» и идёт запись: тап = «стоп» (принять сказанное); ignore — ждём морфинг/диалог ОС/обработку;
 *  fallback — микрофона не будет (start() НЕ вызываем); explain — попап перед запросом ОС (kind: full | short); begin — start() прямо в этом тапе
 * decision — результат sayPermission.decide(); go — isGo(state); hold — идёт показ крестика после неудачи (тапы игнорируются).
 * Число попыток не ограничено: после неудачи микрофон снова доступен
 */
export function planTap({ view, decision, go = false, hold = false }) {
  if (hold) return { act: 'ignore' } // квадрат с крестиком (FAIL_HOLD_MS): кнопки нет, ждём возвращения прямоугольника
  const status = view?.status
  if (status === 'starting' || status === 'listening' || status === 'retrying') {
    return { act: status === 'listening' && go ? 'stop' : 'ignore' }
  }
  if (decision.action === 'fallback') return { act: 'fallback', reason: decision.reason }
  if (decision.action === 'explain') return { act: 'explain', kind: decision.kind }
  return { act: 'begin' }
}
