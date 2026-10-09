// Тексты модуля «Сказать фразу» (на «вы», как в пробе «Голос») и перевод кодов ошибок распознавания в понятные строки.
import { LOUD_HINT } from './speechPolicy.js'

export const EXPLAIN_TEXT = 'Нужен микрофон, чтобы проверить, как вы сказали фразу. Мы не записываем и не сохраняем звук. Фразу распознаёт ваш телефон или браузер.'
export const EXPLAIN_BTN = 'Понятно, включить микрофон'
export const IDLE_HINT = 'Нажмите на микрофон и скажите фразу'
export const LISTENING = 'Слушаю…'
export const PROCESSING = 'Проверяем…'
export const PASSED = 'Верно!'
export const PASSED_SOFT = 'Засчитано!'
export const NOT_YET = 'Не совсем. Попробуйте ещё раз'
export const DENIED_HINT = 'Микрофон выключен. Включите его в настройках.'
export const NO_RECOGNITION = 'На этом устройстве проверка голоса недоступна — скажите фразу вслух и нажмите «Получилось».'
export const CANT_SPEAK_MODE = 'Режим без микрофона — скажите фразу вслух, если можете.'

/** Что показать после неудачной попытки: { status, hint }. code — код ошибки контроллера или null (речь не прошла порог) */
export function failureCopy(code) {
  switch (code) {
    case 'no-speech': case 'silence': return { status: 'Не слышу речь', hint: LOUD_HINT }
    case 'network': return { status: 'Слабая связь — распознавание не ответило', hint: 'Проверьте интернет и нажмите «Ещё раз».' }
    case 'audio-capture': return { status: 'Микрофон недоступен', hint: 'Возможно, его занимает другое приложение.' }
    case 'service-not-allowed': return { status: 'Распознавание речи выключено', hint: 'На iPhone включите «Диктовку» в настройках клавиатуры.' }
    case 'language-not-supported': return { status: 'Язык не поддерживается устройством', hint: null }
    case 'no-start': return { status: 'Запись не началась', hint: 'Нажмите «Ещё раз».' }
    case 'start-failed': return { status: 'Не удалось включить микрофон', hint: 'Нажмите «Ещё раз».' }
    case null: case undefined: return { status: NOT_YET, hint: null }
    default: return { status: 'Не получилось услышать', hint: null }
  }
}

/** Коды, после которых микрофон запрещён — запоминаем отказ до конца запуска и больше не зовём start() */
export const isDeniedCode = code => code === 'not-allowed'
