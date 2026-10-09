// Что написать в статус-строке панели «Сказать фразу» (чистая функция — тестируется без React).
import {
  IDLE_HINT, EXPLAIN_TEXT, LISTENING, PROCESSING, PASSED, PASSED_SOFT, DENIED_HINT, NO_RECOGNITION,
  CANT_SPEAK_MODE, failureCopy,
} from './sayTexts.js'

const WAIT_MIC = 'Включаем микрофон…'

/**
 * @returns {{status: string, hint: string|null, heard: string|null, tone: 'neutral'|'ok'|'warn'}}
 *   status — главная строка, hint — вторая (подсказка), heard — живой interim или «услышали», tone — цвет статуса
 */
export function sayStatus({ phase, view, verdict, errorCode, fallbackReason }) {
  switch (phase) {
    case 'explain': return { status: EXPLAIN_TEXT, hint: null, heard: null, tone: 'neutral' }
    case 'run': {
      if (view.status === 'retrying') return { status: view.notice || LISTENING, hint: null, heard: null, tone: 'warn' }
      if (view.status === 'listening') return { status: LISTENING, hint: null, heard: view.interim || null, tone: 'neutral' }
      if (view.status === 'done') return { status: PROCESSING, hint: null, heard: null, tone: 'neutral' }
      return { status: WAIT_MIC, hint: null, heard: null, tone: 'neutral' }
    }
    case 'passed':
      return { status: verdict?.ratioPct === 100 ? PASSED : PASSED_SOFT, hint: null, heard: verdict?.heard || null, tone: 'ok' }
    case 'failed': {
      const f = failureCopy(errorCode ?? null)
      // Речь услышали, но порог не пройден: подсказываем, чего не хватило
      const missed = verdict?.missed?.length ? `Не хватило: ${verdict.missed.slice(0, 3).join(', ')}` : null
      return { status: f.status, hint: errorCode ? f.hint : (missed ?? f.hint), heard: verdict?.heard || null, tone: 'warn' }
    }
    case 'fallback': {
      const status = fallbackReason === 'denied' ? DENIED_HINT : fallbackReason === 'cant_speak' ? CANT_SPEAK_MODE : NO_RECOGNITION
      return { status, hint: null, heard: null, tone: fallbackReason === 'denied' ? 'warn' : 'neutral' }
    }
    default: return { status: IDLE_HINT, hint: null, heard: null, tone: 'neutral' }
  }
}
