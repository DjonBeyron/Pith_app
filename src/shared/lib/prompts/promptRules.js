// Правила единого бюджета вопросов Пита (PLAN_NEW_USER.md → A1). Здесь только числа и перечисления:
// логика — promptBudget.js, хранение — promptStore.js, очередь и хук — promptSlotCore.js / usePromptSlot.js.
// «Вопрос Пита» — шторка снизу с кружком Пита, ≤2 строк, ≤3 ответами и крестиком.
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Виды шторки (поле kind кандидата)
export const KINDS = {
  question: 'question', // вопрос (в т.ч. «про человека»)
  hint: 'hint',         // подсказка интерфейса
  offer: 'offer',       // предложение (игра, повторение)
  reminder: 'reminder', // напоминание (уведомления)
}

// Категории кандидата (поле reason) от важного к менее важному: pickNext берёт того, чей reason раньше в списке
export const PRIORITY = [
  'explain_done', // объяснить только что сделанное (первое слово → «Память»)
  'asked',        // о чём попросил сам
  'behavior',     // вопрос по поведению
  'ui_hint',      // подсказка интерфейса
  'game_offer',   // предложение игры
  'notify_ask',   // просьба про уведомления
]

// Частота и момент показа
export const MIN_SLIDES_BETWEEN = 5           // не чаще 1 на 5 слайдов (первый показ в сессии — без этого ограничения)
export const MAX_ABOUT_PERSON_PER_SESSION = 1 // вопросов «про человека» за сессию
export const EARLY_SESSIONS = 3               // первые N сессий — строже
export const MAX_PER_SESSION_EARLY = 2        // шторок за сессию в первые EARLY_SESSIONS сессий
export const MAX_PER_SESSION = 3              // шторок за сессию дальше
export const MIN_MS_AFTER_OPEN = 20_000       // не раньше 20 с после входа

// Защита от надоедания
// Закрыл/смахнул вид N раз подряд (без ответа) → вид на паузе. Ключ — число закрытий подряд (3 и больше — как 3)
export const DISMISS_PAUSE_MS = { 2: 7 * DAY, 3: 30 * DAY }
export const HINT_IGNORE_LIMIT = 3     // подсказка, проигнорированная 3 раза, снимается навсегда (по id подсказки)
export const LATER_PAUSE_MS = 3 * HOUR // «Спроси позже» — пауза всех шторок на 3 часа
export const LATER_STREAK_LIMIT = 3    // три «Спроси позже» подряд —
export const LATER_LONG_MS = 7 * DAY   // — пауза 7 суток, счёт с нуля

// Самовыключение вида: ≥10 показов и доля закрытий ≥ 0.7 → вид выключается сам
export const AUTO_OFF_MIN_SHOWN = 10
export const AUTO_OFF_DISMISS_SHARE = 0.7

// Очередь кандидатов (promptSlotCore.js): пока показан один, остальные ждут, но не вечно
export const QUEUE_TTL_MS = 2 * MINUTE // кандидат, не дождавшийся показа за это время, из очереди выпадает
export const MAX_QUEUE = 8             // страховка от разрастания очереди

export const STORAGE_KEY = 'pithy_prompts_v1'
