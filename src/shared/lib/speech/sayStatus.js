// Что написать в панели «Сказать фразу» (чистые функции — тестируются без React).
// Подпись на кнопке микрофона (micLabel) и подсказка под заголовком (sayStatus: итог неудачи, слабая связь, режим без микрофона).
// Сказанного пользователем текста здесь нет: его видит только админ (sayAdmin.js). Сами тексты — sayTexts.js.
import {
  LISTENING, PASSED, PASSED_SOFT, DENIED_HINT, NO_RECOGNITION, CANT_SPEAK_MODE, failureCopy,
  MIC_IDLE, MIC_STARTING, MIC_PROCESSING, MIC_OFF, MIC_UNAVAILABLE,
} from './sayTexts.js'
import { failReason } from './sayResult.js'

/**
 * Строка под заголовком. status/hint — null, если сказать нечего (готов, слушаем, прошли — всё видно на кнопке).
 * failStreak — неудач подряд (после двух — совет «медленнее, по словам»)
 * @returns {{status: string|null, hint: string|null, tone: 'neutral'|'ok'|'warn'}}
 */
export function sayStatus({ phase, view, verdict, errorCode, fallbackReason, failStreak = 1 }) {
  switch (phase) {
    case 'run':
      if (view.status === 'retrying') return { status: view.notice || LISTENING, hint: null, tone: 'warn' }
      return { status: null, hint: null, tone: 'neutral' }
    case 'failed': {
      const f = failureCopy({ reason: failReason({ errorCode, verdict }), missed: verdict?.missed ?? [], streak: failStreak, needTap: !!view?.needTap })
      return { status: f.status, hint: f.hint, tone: 'warn' }
    }
    case 'fallback': {
      const status = fallbackReason === 'denied' ? DENIED_HINT : fallbackReason === 'cant_speak' ? CANT_SPEAK_MODE : NO_RECOGNITION
      return { status, hint: null, tone: fallbackReason === 'denied' ? 'warn' : 'neutral' }
    }
    default: return { status: null, hint: null, tone: 'neutral' } // idle, explain (пояснение — отдельный попап), passed
  }
}

/**
 * Подпись и вид кнопки микрофона. mode: idle (прямоугольник «Нажмите, чтобы говорить») | count (тап есть, три точки: ещё не «начали»)
 * | listening (круг «Слушаю…») | busy (обрабатываем) | ok (прошло) | off (микрофона не будет). go — момент «начали»
 * (sayFlow.isGo): три точки доиграли И движок уже слушает
 * @returns {{label: string, mode: string}}
 */
export function micLabel({ phase, view, verdict, fallbackReason, go = false }) {
  switch (phase) {
    case 'run':
      if (view.status === 'done' || view.status === 'retrying') return { label: MIC_PROCESSING, mode: 'busy' }
      if (go) return { label: LISTENING, mode: 'listening' }
      return { label: MIC_STARTING, mode: 'count' }
    case 'passed': return { label: verdict?.ratioPct === 100 ? PASSED : PASSED_SOFT, mode: 'ok' }
    case 'fallback': return { label: fallbackReason === 'unsupported' ? MIC_UNAVAILABLE : MIC_OFF, mode: 'off' }
    default: return { label: MIC_IDLE, mode: 'idle' }
  }
}
