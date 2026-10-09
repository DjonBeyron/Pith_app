// Тексты модуля «Сказать фразу» (на «вы», как в пробе «Голос») — ЕДИНЫЙ источник: подписи кнопки, подсказки под заголовком панели
// после попыток и перевод кодов ошибок распознавания. Сказанного пользователем текста здесь нет (его видит только админ).
import { LOUD_HINT } from './speechPolicy.js'

export const EXPLAIN_TEXT = 'Нужен микрофон, чтобы проверить, как вы сказали фразу. Мы не записываем и не сохраняем звук. Фразу распознаёт ваш телефон или браузер.'
export const EXPLAIN_BTN = 'Понятно, включить микрофон'
export const SAY_LABEL = 'Произнесите фразу'          // заголовок панели (сама фраза — в сообщении автора перед модулем)
export const MIC_IDLE = 'Нажмите, чтобы говорить'
export const MIC_STARTING = 'Включаем микрофон…'
export const MIC_PROCESSING = 'Обрабатываем…'
export const MIC_OFF = 'Микрофон выключен'
export const MIC_UNAVAILABLE = 'Проверка голоса недоступна'
export const CANT_SPEAK_LINK = 'Я не могу говорить'
export const MISSED_PREFIX = 'Не хватило: '
export const LISTENING = 'Слушаю…'
export const PASSED = 'Верно!'
export const PASSED_SOFT = 'Засчитано!'
export const DENIED_HINT = 'Микрофон выключен. Включите в настройках'
export const NO_RECOGNITION = 'На этом устройстве проверка голоса недоступна. Нажмите «Я не могу говорить», чтобы продолжить'
export const CANT_SPEAK_MODE = 'Режим без микрофона. Можно вернуть микрофон кнопкой «Включить»'

// Подсказки после неудачной попытки (по причине из failReason в sayResult.js)
export const SILENCE_STATUS = 'Не слышу вас'
export const SILENCE_HINT = LOUD_HINT.replace(/\.$/, '')            // «Говорите громче и ближе к микрофону»
export const ALMOST_STATUS = 'Почти!'
export const MISMATCH_STATUS = 'Не совсем. Попробуйте ещё раз'
export const NETWORK_STATUS = 'Слабая связь…'
export const NETWORK_HINT = 'Проверьте интернет и нажмите на микрофон'
export const SLOW_ADVICE = 'Скажите медленнее, по словам'            // после 2 неудач подряд
export const ADVICE_AFTER = 2                                       // неудач подряд до совета
export const TAP_AGAIN = 'Нажмите на микрофон ещё раз'

/**
 * Что показать под заголовком после неудачи: { status, hint }.
 *  reason — failReason() (silence | network | partial | mismatch | код ошибки движка), missed — слова эталона (для «Не хватило»),
 *  streak — неудач подряд, needTap — браузер не дал запустить автоповтор без нажатия
 */
export function failureCopy({ reason = null, missed = [], streak = 1, needTap = false } = {}) {
  const advice = streak >= ADVICE_AFTER ? SLOW_ADVICE : null
  switch (reason) {
    case 'silence': return { status: SILENCE_STATUS, hint: needTap ? TAP_AGAIN : SILENCE_HINT }
    case 'network': return { status: NETWORK_STATUS, hint: NETWORK_HINT }
    case 'partial': return { status: ALMOST_STATUS, hint: missed.length ? `${MISSED_PREFIX}${missed.slice(0, 4).join(', ')}` : advice }
    case 'mismatch': return { status: MISMATCH_STATUS, hint: advice }
    case 'audio-capture': return { status: 'Микрофон недоступен', hint: 'Возможно, его занимает другое приложение' }
    case 'service-not-allowed': return { status: 'Распознавание речи выключено', hint: 'На iPhone включите «Диктовку» в настройках клавиатуры' }
    case 'language-not-supported': return { status: 'Язык не поддерживается устройством', hint: null }
    case 'no-start': return { status: 'Запись не началась', hint: TAP_AGAIN }
    case 'start-failed': return { status: 'Не удалось включить микрофон', hint: TAP_AGAIN }
    case null: case undefined: return { status: MISMATCH_STATUS, hint: advice }
    default: return { status: 'Не получилось услышать', hint: advice }
  }
}

/** Коды, после которых микрофон запрещён — запоминаем отказ до конца запуска и больше не зовём start() */
export const isDeniedCode = code => code === 'not-allowed'
