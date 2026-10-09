// Подпись и вид кнопки микрофона модуля «Сказать фразу» (чистая функция — тестируется без React). Внутри панели НЕТ подсказок и
// статусов: только подпись кнопки, «Слушаю…» в круге и системные состояния «Микрофон выключен» / «Проверка голоса недоступна».
// Подсказки после неудач уходят в чат (sayHints.js). Сказанного пользователем текста здесь нет: его видит только админ (sayAdmin.js).
import { LISTENING, PASSED, PASSED_SOFT, MIC_IDLE, MIC_OFF, MIC_UNAVAILABLE } from './sayTexts.js'

/**
 * Подпись и вид кнопки. mode: idle (прямоугольник «Нажмите, чтобы говорить») | prep (круг: кнопка превратилась, движок ещё
 * не слушает или морфинг не дошёл — кольца спокойно «дышат», подписи нет) | listening (круг «Слушаю…», кольца следуют за голосом) |
 * ok (прошло) | off (микрофона не будет). go — момент «начали» (sayFlow.isGo): морфинг завершён И движок слушает
 * @returns {{label: string, mode: string}}
 */
export function micLabel({ phase, verdict, fallbackReason, go = false }) {
  switch (phase) {
    case 'run': return go ? { label: LISTENING, mode: 'listening' } : { label: '', mode: 'prep' }
    case 'passed': return { label: verdict?.ratioPct === 100 ? PASSED : PASSED_SOFT, mode: 'ok' }
    case 'fallback': return { label: fallbackReason === 'unsupported' ? MIC_UNAVAILABLE : MIC_OFF, mode: 'off' }
    default: return { label: MIC_IDLE, mode: 'idle' }
  }
}
