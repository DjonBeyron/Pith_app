// Что написать в панели «Сказать фразу» (чистые функции — тестируются без React).
// Подпись на кнопке-плашке микрофона (micLabel) и строка под ней (sayStatus: ошибки, слабая связь, режим без микрофона).
// Сказанного пользователем текста здесь нет: его видит только админ (sayAdmin.js).
import {
  LISTENING, PASSED, PASSED_SOFT, DENIED_HINT, NO_RECOGNITION, CANT_SPEAK_MODE, failureCopy,
  MIC_IDLE, MIC_STARTING, MIC_PROCESSING, MIC_OFF, MIC_UNAVAILABLE, MISSED_PREFIX,
} from './sayTexts.js'

/**
 * Строка под кнопкой микрофона. status/hint — null, если сказать нечего (готов, слушаем, прошли — всё видно на кнопке).
 * showPhrase=false: фразы в чате нет, поэтому после неудачи подсказываем «Не расслышали: …» (слова эталона, не цитата сказанного)
 * @returns {{status: string|null, hint: string|null, tone: 'neutral'|'ok'|'warn'}}
 */
export function sayStatus({ phase, view, verdict, errorCode, fallbackReason, showPhrase = true }) {
  switch (phase) {
    case 'run':
      if (view.status === 'retrying') return { status: view.notice || LISTENING, hint: null, tone: 'warn' }
      return { status: null, hint: null, tone: 'neutral' }
    case 'failed': {
      const f = failureCopy(errorCode ?? null)
      const missed = !showPhrase && verdict?.missed?.length ? `${MISSED_PREFIX}${verdict.missed.slice(0, 4).join(', ')}` : null
      return { status: f.status, hint: errorCode ? f.hint : missed, tone: 'warn' }
    }
    case 'fallback': {
      const status = fallbackReason === 'denied' ? DENIED_HINT : fallbackReason === 'cant_speak' ? CANT_SPEAK_MODE : NO_RECOGNITION
      return { status, hint: null, tone: fallbackReason === 'denied' ? 'warn' : 'neutral' }
    }
    default: return { status: null, hint: null, tone: 'neutral' } // idle, explain (пояснение — отдельный попап), passed
  }
}

/**
 * Подпись на кнопке-плашке микрофона. mode: idle | listening | busy | off | ok — для иконки и стиля
 * @returns {{label: string, mode: string}}
 */
export function micLabel({ phase, view, verdict, fallbackReason }) {
  switch (phase) {
    case 'run':
      if (view.status === 'listening') return { label: LISTENING, mode: 'listening' }
      if (view.status === 'done' || view.status === 'retrying') return { label: MIC_PROCESSING, mode: 'busy' }
      return { label: MIC_STARTING, mode: 'busy' }
    case 'passed': return { label: verdict?.ratioPct === 100 ? PASSED : PASSED_SOFT, mode: 'ok' }
    case 'fallback': return { label: fallbackReason === 'unsupported' ? MIC_UNAVAILABLE : MIC_OFF, mode: 'off' }
    default: return { label: MIC_IDLE, mode: 'idle' }
  }
}
