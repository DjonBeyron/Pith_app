// Справочник имён событий журнала поведения (track.js). Новые события — только отсюда:
// одно имя в одном месте, props плоские (числа/строки ≤64 символов/булевы, id модулей/уроков),
// без текста пользователя. Старые события (feed_view, lesson_*, review_*, feed_catch_*,
// say_phrase_*) живут строками в своих файлах — их формат не трогаем.
//
// Лента «Рекомендации»
export const FEED_SWIPE = 'feed_swipe'               // { from, to, dir: 'next'|'prev', ms_prev } — смена слайда жестом/колесом; ms_prev — сколько был на прошлом
export const FEED_PAUSE = 'feed_pause'               // { module_id, on } — пауза/пуск видео тапом (не автоматическая)
export const FEED_SOUND = 'feed_sound'               // { on } — звук ленты включили/выключили чипом
export const FEED_SLOW = 'feed_slow'                 // { module_id, on } — замедление 0.5x: зажал (on) / отпустил (off)
export const FEED_PHRASE_OPEN = 'feed_phrase_open'   // { module_id } — открыл фразу из-под шариков спойлера
export const FEED_REVEAL = 'feed_reveal'             // { module_id } — открыл перевод фразы (потёр или стрелкой)
export const FEED_RECALL_ANSWER = 'feed_recall_answer' // { word, ok, ms } — ответ на «Помнишь?» в ленте
export const FEED_LIKE = 'feed_like'                 // { module_id, on }
export const FEED_SAVE = 'feed_save'                 // { module_id, on } — закладка
export const FEED_REPOST = 'feed_repost'             // { module_id, on: true } — репост (share/копия ссылки)
export const FEED_SEARCH = 'feed_search'             // { len, picked } — длина запроса и выбрал ли результат (текста нет)
export const FEED_FILTER = 'feed_filter'             // { levels: 'g'|'gy'|'gyr'|'' } — фильтр сложности после тапа по чипу ('' — все)
//
// Задание «О чём диалог» на слайде-сцене (features/feed/scene/useSceneTask.js); scene_id — uuid строки scenes
export const SCENE_TASK_SHOWN = 'scene_task_shown'   // { scene_id, kind } — панель выехала после первого полного проигрывания
export const SCENE_TASK_ANSWER = 'scene_task_answer' // { scene_id, kind, ok, attempt, ms } — «Проверить»; ms — от показа панели
export const SCENE_TASK_SKIP = 'scene_task_skip'     // { scene_id, kind } — «Спроси позже» или «Не знаю» (без попытки)
//
// Урок
export const LESSON_ANSWER = 'lesson_answer'         // { lesson_id, node_type, ok, attempt, ms } — ответ на задание (тип ноды обязателен)
// Имя константы без слова ATTEMPT: тест sayPhraseChatWiring запрещает его в коде панели «Сказать фразу»
export const SAY_TRY = 'say_attempt'                 // { lesson_id, ok, engine: 'vosk'|'system' } — засчитанная попытка «Сказать фразу»
