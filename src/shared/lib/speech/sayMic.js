// Подпись и вид кнопки микрофона модуля «Сказать фразу» (чистые функции — тестируются без React). Внутри панели НЕТ подсказок и
// статусов: только подпись кнопки, «Слушаю»/«Стоп» в квадрате и системные состояния «Микрофон выключен» / «Проверка голоса недоступна».
// Подсказки после неудач уходят в чат (sayHints.js). Сказанного пользователем текста здесь нет: его видит только админ (sayAdmin.js).
import { LISTENING, PASSED, PASSED_SOFT, MIC_IDLE, MIC_OFF, MIC_UNAVAILABLE, ATTEMPT } from './sayTexts.js'

/** Режимы, в которых кнопка — КВАДРАТ (во всех остальных — прямоугольник «Нажмите, чтобы говорить») */
export const SQUARE_MODES = ['prep', 'listening', 'ok', 'fail']
export const isSquareMode = mode => SQUARE_MODES.includes(mode)

/**
 * Подпись и вид кнопки. mode: idle (прямоугольник «Нажмите, чтобы говорить») | prep (квадрат формируется: морфинг не кончился или движок
 * ещё не слушает — две половины без текста «Слушаю», кольца спокойно «дышат») | listening (квадрат: «Слушаю» / «Стоп», кольца следуют за
 * голосом) | ok (квадрат остаётся, галочка и «Верно») | fail (квадрат остаётся, крестик на красноватом; FAIL_HOLD_MS, потом idle) |
 * off (микрофона не будет). go — момент «начали» (sayFlow.isGo): морфинг завершён И движок слушает; failShow — идёт показ крестика
 * @returns {{label: string, mode: string}}
 */
export function micLabel({ phase, verdict, fallbackReason, go = false, failShow = false }) {
  switch (phase) {
    case 'run': return go ? { label: LISTENING, mode: 'listening' } : { label: '', mode: 'prep' }
    case 'passed': return { label: verdict?.ratioPct === 100 ? PASSED : PASSED_SOFT, mode: 'ok' }
    case 'failed': return failShow ? { label: '', mode: 'fail' } : { label: MIC_IDLE, mode: 'idle' }
    case 'fallback': return { label: fallbackReason === 'unsupported' ? MIC_UNAVAILABLE : MIC_OFF, mode: 'off' }
    default: return { label: MIC_IDLE, mode: 'idle' }
  }
}

/**
 * Счётчик попыток справа от кнопки: «Попытка N» (N — число начатых записей в этом модуле). Появляется после первой неудачи и остаётся
 * при следующих; при успехе (и пока неудач не было) — null
 */
export function attemptText({ taps, failStreak, phase }) {
  if (!(failStreak > 0) || !(taps > 0) || phase === 'passed') return null
  return `${ATTEMPT} ${taps}`
}
