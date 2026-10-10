// Надпись над кругом и вид круга-микрофона модуля «Сказать фразу» (чистые функции — тестируются без React). Внутри панели НЕТ подсказок и
// статусов: только надпись НАД кругом (кросс-фейд, SayCaption.jsx) и значок/«Готово» в самом круге. Подсказки после неудач и реплика ученика
// уходят в ЧАТ (sayHints.js, sayReply.js). Круг всегда круглый: режим меняет лишь надпись, волны и содержимое круга.
import { MIC_IDLE, SAY_LABEL, MIC_RETRY, MIC_OFF, MIC_UNAVAILABLE, BROWSER_NOTE } from './sayTexts.js'

/** Режимы, в которых идёт запись: круг пульсирует сильнее, искусственные волны заменены живым эквалайзером */
export const LIVE_MODES = ['prep', 'listening']
export const isLiveMode = mode => LIVE_MODES.includes(mode)

/**
 * Надпись над кругом и режим. mode: idle («Нажмите, чтобы говорить») | prep (тап был, движок ещё не слушает или «стоп» пока заблокирован:
 * «Произнесите фразу», эквалайзер уже живой) | listening (движок слушает, повторный тап = «стоп») | retry (неудача: «Попробуйте сказать ещё раз») |
 * ok (в круге галочка и «Готово», надписи над кругом нет) | off (микрофона не будет; в Firefox вместо круга — пояснение BROWSER_NOTE, SayBrowserNote.jsx). go — момент «можно остановить» (sayFlow.isGo).
 * @returns {{label: string, mode: string}}
 */
export function micLabel({ phase, fallbackReason, go = false, exhausted = false }) {
  switch (phase) {
    case 'run': return { label: SAY_LABEL, mode: go ? 'listening' : 'prep' }
    case 'passed': return { label: '', mode: 'ok' }
    case 'failed': return { label: exhausted ? '' : MIC_RETRY, mode: 'retry' } // после третьей неудачи панель уходит по ветке «неверный»: «ещё раз» уже не зовём
    case 'fallback': return { label: fallbackReason === 'browser' ? BROWSER_NOTE : fallbackReason === 'unsupported' ? MIC_UNAVAILABLE : MIC_OFF, mode: 'off' }
    default: return { label: MIC_IDLE, mode: 'idle' }
  }
}

/** Круг внутри уже не пульсирует и без волн: успех или микрофона не будет */
export const isCalmMode = mode => mode === 'ok' || mode === 'off'
