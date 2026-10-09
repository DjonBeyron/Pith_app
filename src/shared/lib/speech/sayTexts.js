// Тексты модуля «Сказать фразу» (на «вы», как в пробе «Голос») — ЕДИНЫЙ источник: подписи панели и ДЕФОЛТНЫЕ подсказки после
// неудачной попытки. Подсказки уходят в чат пузырями слева (текст можно переопределить в ноде: hintSilence/hintMismatch/hintPartial),
// внутри панели никаких подсказок нет. Сказанного пользователем текста здесь нет (его видит только админ).

export const EXPLAIN_TEXT = 'Нужен микрофон, чтобы проверить, как вы сказали фразу. Мы не записываем и не сохраняем звук. Фразу распознаёт ваш телефон или браузер.'
export const EXPLAIN_BTN = 'Понятно, включить микрофон'
export const SAY_LABEL = 'Произнесите фразу'          // заголовок панели (сама фраза — в сообщении автора перед модулем)
export const MIC_IDLE = 'Нажмите, чтобы говорить'
export const MIC_OFF = 'Микрофон выключен'
export const MIC_UNAVAILABLE = 'Проверка голоса недоступна'
export const CANT_SPEAK_LINK = 'Я не могу говорить'
export const LISTENING = 'Слушаю…'
export const PASSED = 'Верно!'
export const PASSED_SOFT = 'Засчитано!'

// Дефолтные подсказки в чат (по одной на тип неудачи); автор меняет их в ноде, пустое поле = этот текст
export const HINT_SILENCE_DEFAULT = 'Не слышу вас. Говорите громче и ближе к микрофону.'
export const HINT_MISMATCH_DEFAULT = 'Не совсем. Попробуйте ещё раз, чуть медленнее.'
export const HINT_PARTIAL_DEFAULT = 'Почти! Верно: {ok}. Не хватило: {missed}.'
export const HINT_FALLBACK = 'Почти!'   // страховка, если шаблон «почти» после подстановки оказался пустым
export const HINT_DEFAULTS = { silence: HINT_SILENCE_DEFAULT, mismatch: HINT_MISMATCH_DEFAULT, partial: HINT_PARTIAL_DEFAULT }

/** Коды, после которых микрофон запрещён — запоминаем отказ до конца запуска и больше не зовём start() */
export const isDeniedCode = code => code === 'not-allowed'
