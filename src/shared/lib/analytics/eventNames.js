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
export const SCENE_TASK_SHOWN = 'scene_task_shown'   // { scene_id, kind: 'translate'|'say'|'repeat' } — панель выехала после первого полного проигрывания
export const SCENE_TASK_ANSWER = 'scene_task_answer' // { scene_id, kind, ok, attempt, ms[, engine: 'vosk'|'system'] } — «Проверить» / итог голосовой попытки; ms — от показа панели; транскрипта нет
export const SCENE_TASK_SKIP = 'scene_task_skip'     // { scene_id, kind[, reason: 'cant'] } — «Спроси позже», «Не знаю» или «Не могу говорить» (без попытки)
//
// Вопросы Пита (shared/lib/prompts): единая шторка снизу под общим бюджетом; props плоские, без текста пользователя.
// Все три события несут group: 'control'|'prompts' (контрольная группа без вопросов, prompts/promptGroup.js) — для разреза в аналитике
export const PROMPT_SHOWN = 'prompt_shown'           // { kind: 'question'|'hint'|'offer'|'reminder', id, group } — шторка выехала
export const PROMPT_ANSWER = 'prompt_answer'         // { kind, id, answer, group, ms } — выбрал ответ (answer — id ответа, ≤64 символов); ms — от показа шторки
export const PROMPT_DISMISS = 'prompt_dismiss'       // { kind, id, ms, later, group } — закрыл/смахнул (later: false) или «Спроси позже» (later: true)
//
// Урок
export const LESSON_ANSWER = 'lesson_answer'         // { lesson_id, node_type, ok, attempt, ms } — ответ на задание (тип ноды обязателен)
// Имя константы без слова ATTEMPT: тест sayPhraseChatWiring запрещает его в коде панели «Сказать фразу»
export const SAY_TRY = 'say_attempt'                 // { lesson_id, ok, engine: 'vosk'|'system' } — засчитанная попытка «Сказать фразу»
//
// Память
export const MEMORY_INTRO_OPEN = 'memory_intro_open' // { voice } — первое открытие вкладки «Память»: рассказ Пита показан (voice — была ли озвучка, иначе только субтитры)
export const REMIND_TIME_SET = 'remind_time_set'     // { preset: '9'|'14'|'20'|'custom'|'none', push: 'ask'|'add_home'|'granted'|'denied'|'guest' } — ответ на «Когда удобно учиться?»; push — что дальше с уведомлениями
export const MEMORY_SEED = 'memory_seed'             // { word, saved } — «Семена памяти»: после верного ответа в игре ленты предложили сохранить слово; saved: true — «Сохранить», false — «Не сейчас»
