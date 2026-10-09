// Вопрос «Сколько минут в день?» — чистая часть: тексты, тайминги и «что дальше».
// Компоненты (MinutesSheet / MinutesThanks) только рисуют; тест — minutesFlow.test.js.

export const MINUTE_CHOICES = [5, 10, 15]

// Первый раз (онбординг после первого урока) объясняем, зачем спрашиваем; в
// настройках профиля (шестерёнка → «Повторение») человек уже знает — коротко.
const TITLE = 'Сколько минут в день тебе комфортно заниматься?'
const LEAD_ONBOARDING = 'Так мы подберём спокойный темп повторения слов и не перегрузим тебя. '
  + 'Передумаешь — поменяешь в любой момент: Профиль → ⚙ Настройки → «Повторение»'
const LEAD_SETTINGS = 'Столько времени в день будет занимать повторение слов. Можно менять в любой момент'

export function minutesCopy(onboarding) {
  return { title: TITLE, lead: onboarding ? LEAD_ONBOARDING : LEAD_SETTINGS }
}

// Экран «ждём» после выбора (только онбординг)
export const THANKS_COPY = {
  title: 'Спасибо за ответ!',
  lead: 'Мы настраиваем обучение под вас',
}

// Раскладка по времени от тапа (мс): галочка на варианте → вопрос гаснет →
// «Спасибо» держится → дальше. Ответ сохраняется сразу при тапе, не по таймеру.
export const TIMING = { checkMs: 550, fadeMs: 300, thanksMs: 1800 }

export function pickTimeline({ checkMs, fadeMs, thanksMs } = TIMING) {
  return { fadeAt: checkMs, thanksAt: checkMs + fadeMs, doneAt: checkMs + fadeMs + thanksMs }
}

// После выбора: гостю с кнопкой входа — подводка «Сохрани прогресс», иначе закрыть
export function afterPickStep(isGuest, canAuth) {
  return isGuest && canAuth ? 'guest' : 'close'
}
