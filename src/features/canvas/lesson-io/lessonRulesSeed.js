// Стандартный набор правил для окна правил: текст из lessonRulesDefaults.js + структура (название, группа, кто проверяет, серьёзность,
// примеры «нельзя / можно»). Это ЗАГОТОВКА: «Загрузить стандартные правила» кладёт её в таблицу lesson_rules, дальше источник правды — база,
// правится в окне правил. Тот же набор берут скрипты (scripts/lesson-rules.mjs), пока выгрузки правил из базы нет.
// Строка меты: [название, группа, кто проверяет (auto|judge|manual), серьёзность (error|warn), «нельзя», «можно»]
import { PRINCIPLES, PRE_SUBMIT_CHECKLIST } from './lessonRulesDefaults.js'

const F = 'Формула и ритм', T = 'Тон и общение', S = 'Выделения и стиль', Z = 'Задания', V = 'Голос и сказать', G = 'Сигналы', C = 'Холст и раскладка', B = 'Таблицы'

const PRINCIPLE_META = [
  ['Главная формула урока', F, 'judge', 'error', 'Текст: «Форма tries.» → сразу type_word «tries» (ответ уже написан в двух нодах выше).', 'Пример в тексте → задание на НОВУЮ форму/местоимение, ответа в пояснении нет.'],
  ['Один урок — одно целевое слово', F, 'judge', 'warn'],
  ['Простые дополнения в упражнениях', Z, 'judge', 'warn'],
  ['После голоса — не текст', Z, 'auto', 'error', 'audio → text', 'audio → photo (или задание)'],
  ['Фото однозначно передаёт время', Z, 'judge', 'warn'],
  ['replyToSeq только назад', C, 'auto', 'error'],
  ['Сборка фразы — не «скажи вслух»', Z, 'judge', 'warn'],
  ['Не выдавать пол ученика', T, 'judge', 'warn', '«Ты справился!»', '«Получилось!»'],
  ['После верного ответа хватает реакции', T, 'judge', 'warn'],
  ['Чередуй реакции', T, 'judge', 'warn', 'text, text, text подряд как подтверждения', 'reaction → text → sticker'],
  ['Длинный текст — это audio', Z, 'judge', 'warn'],
  ['hardWrap для перечислений', S, 'judge', 'warn'],
  ['Выделения — разметкой в тексте', S, 'judge', 'warn', '"highlights":[{"start":6,"end":11,"mode":"bold"}]', '"content":"Форма {g:tries}"'],
  ['Цвет всегда вместе с bold', S, 'judge', 'error', 'только mode:text + color, без bold на том же диапазоне', '{g:слово} — цвет и bold строит код'],
  ['Замена буквы в слове — плашка', S, 'judge', 'warn', '"tries" красится целиком', 'tr{p:i}es — плашка на букве'],
  ['Таблица dictator озвучена', B, 'judge', 'warn'],
  ['Таблица с конкретной фразой', B, 'judge', 'warn'],
  ['Таблица-подсказка не на проверке', B, 'judge', 'warn'],
  ['Картинка — описание в imagePrompt', Z, 'auto', 'error'],
  ['Зоны для смысловых кусков', C, 'judge', 'warn'],
  ['Сигналы в table и phrase_assembly', G, 'judge', 'warn'],
  ['Не экономь место на холсте', C, 'judge', 'warn'],
  ['Раскладка нод-сигналов', G, 'judge', 'warn'],
  ['Сигнал читается самодостаточно', G, 'judge', 'warn'],
  ['Сигнал на слот, где ошибка возможна', G, 'judge', 'error'],
  ['Не дублируй сигналы', G, 'judge', 'warn'],
  ['Граф понятен без сигналов', G, 'judge', 'warn'],
  ['Сигнал срабатывает один раз', G, 'judge', 'warn'],
  ['Пояснение перед fill_blanks', Z, 'judge', 'warn'],
  ['Тон: переписка с другом Питом', T, 'judge', 'warn', '«Верно! Совершенно верно!»', '«Ага, в точку 😏»'],
  ['Примеры из жизни Пита', T, 'judge', 'warn', '«Он каждый день делает X.»', '«Кстати, мой брат каждый день делает X.»'],
  ['Не повторяй собранную фразу эхом', T, 'judge', 'warn'],
  ['Перевод — белый курсив', S, 'judge', 'error', '{w:«Она пробует теннис»} — белый bold', '{t:«Она пробует теннис»} — курсив #fdfcfc, без bold'],
  ['Нода-реакция — не пустое слово', T, 'judge', 'warn'],
  ['Базовая подложка на весь текст', S, 'auto', 'warn'],
  ['fill_blanks: фраза уходит в чат', Z, 'judge', 'warn'],
  ['type_word: одно слово, ловушки', Z, 'judge', 'warn'],
  ['type_word: сигналы на букву', G, 'judge', 'warn'],
  ['say_phrase: как устроен', V, 'auto', 'error'],
  ['Несколько верных ответов', Z, 'auto', 'warn'],
  ['Лимит времени для раунда скорости', Z, 'auto', 'warn'],
  ['Свободная фраза и голосовая подсказка', V, 'auto', 'error', 'Подсказка-сигнал произносит всю фразу: «We will try pottery»', 'Подсказка называет слово: «Слушай слово: pottery»'],
]

const CHECKLIST_META = [
  ['Не повторяй слова-дополнения', Z, 'judge', 'warn'],
  ['Русские промпты сверить с ответом', Z, 'judge', 'warn'],
  ['В блоке есть задание на слух', V, 'judge', 'warn'],
  ['Похвала по факту', T, 'judge', 'warn'],
  ['Паузы между группами нод', C, 'judge', 'warn'],
  ['Все «…» по-русски — перевод', S, 'judge', 'error', 'Кавычки «…» белым bold', 'Кавычки «…» целиком в {t:…}'],
  ['Table: дистракторы', B, 'judge', 'warn'],
  ['Ответ не зависит от невидимого на фото', Z, 'judge', 'warn'],
  ['replyToSeq на читаемую ноду', C, 'judge', 'warn'],
  ['Базовый серый везде', S, 'auto', 'warn'],
]

const build = (texts, metas, category) => texts.map((text, i) => {
  const [title = '', group = '', checker = 'judge', severity = 'warn', bad = '', good = ''] = metas[i] ?? []
  return { text, category, title, group, checker, severity, bad, good }
})

/** Все стандартные правила: сначала принципы, затем чек-лист. Длины мет и текстов обязаны совпадать (проверяет lessonRulesSeed.test.js) */
export const SEED_RULES = [...build(PRINCIPLES, PRINCIPLE_META, 'principle'), ...build(PRE_SUBMIT_CHECKLIST, CHECKLIST_META, 'checklist')]
export const SEED_META_LENGTHS = { principles: PRINCIPLE_META.length, checklist: CHECKLIST_META.length }
