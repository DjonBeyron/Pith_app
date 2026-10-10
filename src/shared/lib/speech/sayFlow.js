// Чистый автомат панели «Сказать фразу» (reducer): как контроллер распознавания (speechController) и тапы ученика
// переводят панель между состояниями. Без React и без побочных эффектов — поэтому покрыт тестами; события аналитики и
// флаги разрешений снимает с результата хук useSayPhrase.js.
//
// phase: idle (готов) | explain (пояснение перед самым первым запросом) | run (запись/ожидание) |
//        passed (прошло порог) | failed (не прошло/ошибка; микрофон снова доступен) | fallback (микрофона не будет, см. fallbackReason)
// Круг-микрофон реагирует на тап СРАЗУ (phase 'run' ставит begin в том же тапе — эквалайзер живой, не дожидаясь событий распознавания).
// «Можно остановить» (isGo) = движок уже слушает (audiostart) И прошла короткая защита от двойного тапа (STOP_ARM_MS, действие 'arm'):
// иначе второй тап по кругу сразу обрывал бы только начатую запись.
// Неудача (phase 'failed') сразу возвращает кружку к «Попробуйте сказать ещё раз» — ни крестика, ни красного слоя, ни паузы-показа.
// Она кладёт в state.reply реплику ученика (то, что распознал движок, sayReply.js; null — тишина/ошибка) и в state.hint подсказку
// для чата (sayHints.js; null — отключена в ноде или ошибка требует действия пользователя). ЗАСЧИТАННЫХ попыток MAX_FAILED_ATTEMPTS (три); после третьей неудачи
// exhausted=true — панель уходит по ветке «неверный» (SayPhrasePanel). Что тратит попытку (внутренний счёт attempts, ученику он НЕ показывается; taps — нажатия для аналитики):
//  - завершённый прогон, где что-то РАСПОЗНАНО (в том числе неверное) — тратит;  - тишина (ничего не услышано) — НЕ тратит, но MAX_SILENCES тишин ПОДРЯД = одна неудача (silences);
//  - ошибки движка и разрешения микрофона — НЕ тратят (и обрывают серию тишин).
// explainKind — какой попап перед запросом микрофона (full | short | intro, см. sayPermission.pickExplainKind); realLevel — пометка для строки админа
// («вкл» / «выкл» / «ошибка …»: опциональный реальный уровень звука для колец, sayRealLevel.js); engine — какой движок выбран на эту попытку ({engine: 'vosk'|'system', reason}, sayEnginePick.js): пометка для админа.
import { emptyView } from './speechController.js'
import { judgeRun, interimDiffers, failReason, SAY_EVENTS } from './sayResult.js'
import { isDeniedCode } from './sayTexts.js'
import { adminHeardLine } from './sayAdmin.js'
import { buildHint } from './sayHints.js'
import { userReply } from './sayReply.js'
import { isQuietCode } from './speechPolicy.js'

/** Защита от двойного тапа: столько мс после тапа повторный тап по кругу ещё НЕ останавливает запись */
export const STOP_ARM_MS = 350
/** Сколько засчитанных неудач до ветки «неверный» и сколько тишин подряд считаются одной неудачей */
export const MAX_FAILED_ATTEMPTS = 3
export const MAX_SILENCES = 3

/**
 * Как итог неудачной попытки влияет на счёт. Чистая функция: { attempts, silences } до → после.
 * spoke — движок что-то распознал (verdict с непустым текстом); quiet — тишина (no-speech / silence / ничего не пришло)
 */
export function nextCounts({ attempts, silences }, { spoke, quiet }) {
  if (spoke) return { attempts: attempts + 1, silences: 0 }
  if (!quiet) return { attempts, silences: 0 }
  return silences + 1 >= MAX_SILENCES ? { attempts: attempts + 1, silences: 0 } : { attempts, silences: silences + 1 }
}

export function initialSayState(decision) {
  const base = {
    phase: 'idle', taps: 0, view: emptyView, verdict: null, errorCode: null, fallbackReason: null, autoRetries: 0,
    explainer: false, explainKind: null, realLevel: null, audioSession: null, engine: null, data: null, settledRun: 0, event: null, failStreak: 0, attempts: 0, silences: 0, exhausted: false, armed: false, adminLine: null, hint: null, hintNo: 0, reply: null,
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
    const spoke = !!verdict?.heard?.trim()
    const counts = nextCounts(s, { spoke, quiet: !spoke && (isQuietCode(errorCode) || (!errorCode && !!verdict)) })
    const exhausted = counts.attempts >= MAX_FAILED_ATTEMPTS
    const reason = failReason({ errorCode, verdict })
    const h = buildHint(s.data, { errorCode, verdict })
    const hintNo = h ? s.hintNo + 1 : s.hintNo
    const text = verdict ? userReply(verdict) : null
    return {
      ...s, ...mark, ...counts, exhausted, phase: 'failed', verdict, errorCode, failStreak, hintNo, hint: h ? { ...h, n: hintNo } : null, reply: text ? { text, n: failStreak } : null,
      event: ev({ passed: false, reason, failStreak, ratioPct: verdict?.ratioPct, engineFixed: verdict?.engineFixed?.length || undefined, hintKind: h?.kind, exhausted }),
    }
  }
  if (v.status === 'error') {
    if (isDeniedCode(v.error)) {
      return { ...s, ...mark, phase: 'fallback', fallbackReason: 'denied', verdict: null, errorCode: null, hint: null, reply: null, event: ev({ passed: false, reason: 'denied' }) }
    }
    return failed(v.error, null)
  }
  if (!v.final) return failed('no-speech', null) // остановили до речи / ничего не распознано: для ученика это «не слышу вас»
  const verdict = judgeRun(v, s.data)
  if (!verdict.passed) return failed(null, verdict)
  return {
    ...s, ...mark, phase: 'passed', verdict, errorCode: null, failStreak: 0, silences: 0, hint: null, reply: null,
    event: ev({ passed: true, ratioPct: verdict.ratioPct, interimDiffers: interimDiffers(v.lastInterim, v.final?.text), engineFixed: verdict.engineFixed?.length || undefined }),
  }
}

// Строка админа остаётся прежней, пока новое состояние не даёт новой (очищает её только 'begin')
const withAdminLine = (prev, next) => ({
  ...next,
  adminLine: adminHeardLine({ isAdmin: true, phase: next.phase, view: next.view, verdict: next.verdict, errorCode: next.errorCode, realLevel: next.realLevel, audioSession: next.audioSession, engine: next.engine }) ?? prev.adminLine,
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
    case 'begin': if (s.exhausted) return s // три неудачи уже были: панель уходит по ветке «неверный», новая запись не начинается
      return { ...s, phase: 'run', taps: s.taps + 1, verdict: null, errorCode: null, data: a.data, armed: false, realLevel: a.realLevel ?? null, audioSession: a.audioSession ?? null, engine: a.engine ?? null, adminLine: null, hint: null, reply: null }
    case 'arm': return s.phase === 'run' ? { ...s, armed: true } : s
    case 'realStatus': return s.realLevel === a.status ? s : { ...s, realLevel: a.status }
    case 'explain': return { ...s, phase: 'explain', explainer: true, explainKind: a.kind === 'short' || a.kind === 'intro' ? a.kind : 'full' }
    case 'explainCancel': return s.phase === 'explain' ? { ...s, phase: 'idle' } : s // закрыли попап мимо кнопки: ничего не просили, флаг пояснения не ставим
    case 'fallback': return a.onlyIdle && s.phase !== 'idle' ? s : { ...s, phase: 'fallback', fallbackReason: a.reason }
    case 'enable': return { ...s, phase: 'idle', fallbackReason: null }
    // Запись прервали (сворачивание/уход со страницы): попытка не тратится, панель снова готова
    case 'interrupt':
      return s.phase === 'run' ? { ...s, phase: 'idle', taps: Math.max(0, s.taps - 1), view: emptyView, armed: false } : s
    default: return s
  }
}

/** «Можно остановить»: распознавание слушает И прошла защита от двойного тапа. Автопопытки (attempt > 1) защиту не повторяют — ждут только audiostart */
export const isGo = s => s.phase === 'run' && s.view?.status === 'listening' && (s.armed || (s.view.attempt ?? 1) > 1)

/**
 * Что делать по тапу на микрофон (чистое решение; start() зовёт только 'begin').
 *  stop — «можно остановить» и идёт запись: тап = «стоп» (принять сказанное); ignore — ждём защиту от двойного тапа/диалог ОС/обработку;
 *  fallback — микрофона не будет (start() НЕ вызываем); explain — попап перед запросом ОС или вводный (kind: full | short | intro); begin — start() прямо в этом тапе
 * decision — результат sayPermission.decide(); go — isGo(state); running — идёт попытка (phase 'run'): пока движок не начал слушать (старт стоит в очереди
 * перезапуска, диалог ОС), повторный тап по кругу НЕ запускает вторую запись. Число попыток не ограничено: после неудачи микрофон снова доступен сразу
 */
export function planTap({ view, decision, go = false, running = false }) {
  const status = view?.status
  if (running || status === 'starting' || status === 'listening' || status === 'retrying') {
    return { act: status === 'listening' && go ? 'stop' : 'ignore' }
  }
  if (decision.action === 'fallback') return { act: 'fallback', reason: decision.reason }
  if (decision.action === 'explain') return { act: 'explain', kind: decision.kind }
  return { act: 'begin' }
}
