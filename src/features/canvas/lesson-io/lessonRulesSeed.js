// Стандартный набор правил для окна правил: текст из lessonRulesDefaults.js + структура (название, группа, кто проверяет, серьёзность,
// примеры «нельзя / можно»). Это ЗАГОТОВКА: «Загрузить стандартные правила» кладёт её в таблицу lesson_rules, дальше источник правды — база,
// правится в окне правил. Тот же набор берут скрипты (scripts/lesson-rules.mjs), пока выгрузки правил из базы нет.
// Строка меты: [название, группа, кто проверяет (auto|judge|manual), серьёзность (error|warn), «нельзя», «можно»]
import { PRINCIPLES, PRE_SUBMIT_CHECKLIST } from './lessonRulesDefaults.js'

const Q = 'Последовательности', F = 'Формула и ритм', T = 'Тон и общение', S = 'Выделения и стиль', Z = 'Задания', V = 'Голос и сказать', G = 'Сигналы', C = 'Холст и раскладка', B = 'Таблицы'

const PRINCIPLE_META = [
  ['Главная формула урока', F, 'judge', 'error', 'text: Для he, she, it пишем {g:tries}\ntype_word: tries', 'text: Для he, she, it форма меняется\ntype_word: Маша каждый день пытается встать пораньше → tries'],
  ['Один урок — одно целевое слово', F, 'judge', 'warn'],
  ['Простые дополнения в упражнениях', Z, 'judge', 'warn'],
  ['После голоса — не текст', Q, 'auto', 'error', 'audio: Скажи вслух: tries\ntext: Теперь разберём правило', 'audio: Скажи вслух: tries\nphoto: She tries tennis'],
  ['Фото однозначно передаёт время', Z, 'judge', 'warn'],
  ['replyToSeq только назад', C, 'auto', 'error'],
  ['Сборка фразы — не «скажи вслух»', Z, 'judge', 'warn'],
  ['Не выдавать пол ученика', T, 'judge', 'warn', 'text: Ты справился!', 'text: Получилось!'],
  ['После верного ответа хватает реакции', T, 'judge', 'warn'],
  ['Чередуй реакции', Q, 'judge', 'warn', 'text: Верно!\ntext: Верно!\ntext: Верно!', 'reaction: 👏\ntext: Ага, в точку 😏\nreaction: 🔥'],
  ['Длинный текст — это audio', Z, 'judge', 'warn'],
  ['hardWrap для перечислений', S, 'judge', 'warn'],
  ['Выделения — разметкой в тексте', S, 'judge', 'warn', 'text: "highlights":[{"start":6,"end":11,"mode":"bold"}]', 'text: Форма {g:tries}'],
  ['Цвет всегда вместе с bold', S, 'judge', 'error', 'text: Форма tries (только цвет, без жирного)', 'text: Форма {g:tries}'],
  ['Замена буквы в слове — плашка', S, 'judge', 'warn', 'text: Форма {g:tries}: y меняется на i', 'text: Форма tr{p:i}es — {b:y} меняется на {b:i}'],
  ['Таблица dictator озвучена', B, 'judge', 'warn'],
  ['Таблица с конкретной фразой', B, 'judge', 'warn'],
  ['Таблица-подсказка не на проверке', Q, 'judge', 'warn'],
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
  ['Пояснение перед fill_blanks', Q, 'judge', 'warn'],
  ['Тон: переписка с другом Питом', T, 'judge', 'warn', 'text: Верно! Совершенно верно!', 'text: Ага, в точку 😏'],
  ['Примеры из жизни Пита', T, 'judge', 'warn', 'text: Он каждый день делает зарядку.', 'text: Кстати, мой брат каждый день делает зарядку 😄'],
  ['Не повторяй собранную фразу эхом', T, 'judge', 'warn'],
  ['Перевод — белый курсив', S, 'judge', 'error', 'text: {w:«Она пробует теннис»}', 'text: {t:«Она пробует теннис»}'],
  ['Нода-реакция — не пустое слово', T, 'judge', 'warn'],
  ['Базовая подложка на весь текст', S, 'auto', 'warn'],
  ['fill_blanks: фраза уходит в чат', Z, 'judge', 'warn'],
  ['type_word: одно слово, ловушки', Z, 'judge', 'warn'],
  ['type_word: сигналы на букву', G, 'judge', 'warn'],
  ['say_phrase: как устроен', V, 'auto', 'error'],
  ['Несколько верных ответов', Z, 'auto', 'warn'],
  ['Лимит времени для раунда скорости', Z, 'auto', 'warn'],
  ['Свободная фраза и голосовая подсказка', V, 'auto', 'error', 'audio: We will try pottery', 'audio: Слушай слово: pottery'],
  ['Не больше двух текстов подряд', Q, 'auto', 'error', 'text: Сначала запомни форму.\ntext: Она меняется с he, she, it.\ntext: Вот пример: She tries.', 'text: С he, she, it форма {g:tries}, а не try\nword_choice: She ___ tennis'],
  ['Не больше двух одинаковых заданий подряд', Q, 'auto', 'warn', 'word_choice: Он пробует?\nword_choice: Она пробует?\nword_choice: Мы пробуем?', 'word_choice: Он пробует?\nphrase_assembly: She tries tennis\nsay_phrase: She tries tennis'],
  ['Урок открывается действием', Q, 'judge', 'warn', 'text: Привет!\ntext: Сегодня разберём try.\ntext: Это глагол.\ntext: У него несколько форм.', 'text: Привет! Хочешь сразу к делу?\nword_choice: Сразу к делу / Сначала объясни'],
  ['Правило — после первого действия', Q, 'judge', 'warn', 'pin_message: he, she, it → {g:tries}\ntype_word: tries', 'type_word: tries\nreaction: 👌\npin_message: he, she, it → {g:tries}'],
  ['Ветка ошибки коротка и возвращается', Q, 'judge', 'warn'],
  ['say_phrase идёт парой', Q, 'judge', 'warn', 'say_phrase: She tries tennis\nsay_phrase: We tried chess', 'text: Скажи по-английски: {t:«Она пробует теннис»}\nsay_phrase: She tries tennis\nreaction: 🔥'],
  ['Конец урока: итог → выбор', Q, 'judge', 'warn'],
  ['type_word — мини-фраза, а не слово из пояснения', Z, 'auto', 'warn', 'text: Начнём с {g:try}: пытаюсь, пытаешься\ntype_word: try', 'text: Как будет {t:«я пытаюсь»}?\ntype_word: I try'],
  ['Естественный порядок слов в реплике', T, 'judge', 'warn', 'text: Мостик {g:to} между двумя глаголами', 'text: {g:to} — это мостик между двумя глаголами 🌉'],
  ['Тире — максимально редко', T, 'auto', 'warn', 'text: Правило тут одно — лучше сказать с ошибкой, чем промолчать.', 'text: правило тут одно: лучше сказать с ошибкой, чем промолчать))'],
  ['Смайлы: 40% эмодзи, 60% скобки', T, 'auto', 'warn', 'text: Получилось 🔥\ntext: Вышло 👏\ntext: В точку 👌\ntext: Ого, быстро 🚀', 'text: Получилось))\ntext: Вышло 👏\ntext: в точку)\ntext: ого, быстро)))'],
  ['Не всегда с большой буквы', T, 'judge', 'warn', 'text: Бывает) Главное без окончания: {g:You try to dance}', 'text: бывает), главное без окончания: {g:You try to dance}'],
  ['Точки в конце — не больше 10%', T, 'auto', 'warn', 'text: Ты уже говоришь с этой формой. Смело продолжай.', 'text: ты уже говоришь с этой формой, смело продолжай))'],
  ['Слова-паразиты и безобидные междометия — иногда', T, 'judge', 'warn', 'text: Ты уже говоришь с этой формой. Смело продолжай 🔥', 'text: Вооу, это очень хорошо))'],
  ['Между модулями — связка', Q, 'judge', 'warn', 'text: {t:«Завтра она попробует суп»}\nphrase_assembly: She will try soup', 'text: а теперь переведи {t:«Завтра она попробует суп»}\nphrase_assembly: She will try soup'],
  ['При ошибке объясняй явно и по логике', Z, 'judge', 'warn', 'text: Завтра — это {g:will try}: {g:She will try soup}', 'text: если мы говорим про завтра, это будущее, значит используем {g:will try}, то есть {g:She will try soup}'],
  ['Не объявляй формат, говори по-человечески', T, 'auto', 'warn', 'text: Мини-сцена 😄 Маша пишет, ты отвечаешь по ситуации\ntext: Раунд на время ⏱ Не успеешь — без штрафа', 'text: Представь, Маша пишет, а ты отвечаешь по ситуации 😄\ntext: давай на время, я сделаю вид, что не заметил, если не успеешь)))'],
  ['Популярные темы, а не редкие хобби', T, 'judge', 'warn', 'text: Маша: завтра идём на гончарку, ты с нами?', 'text: Маша: завтра идём на боулинг, ты с нами? 🎳'],
  ['Задания вызывай по-разному', Q, 'auto', 'warn', 'text: Теперь вслух 🎤 скажи…\ntext: А теперь переведи…\ntext: Теперь напечатай…', 'text: Теперь вслух 🎤 скажи…\naudio: Слушай и повтори: …\nphoto: Маша на корте 🎾 собери фразу…'],
  ['Задание должно быть однозначным', Z, 'judge', 'warn', 'text: Скажи, что ты сейчас пытаешься делать, начни с {g:I am trying to}…', 'text: а теперь про тебя: скажи по-английски {t:«я пытаюсь расслабиться»}'],
  ['Таблица, когда правило проще показать сеткой', Z, 'auto', 'warn', 'text: he, she, it → tries (пересказ текстом вместо сетки)', 'table: формы по лицам (I, you, we, they → try; he, she, it → tries)'],
  ['Плавные переходы и итог', Q, 'judge', 'warn', 'text: {g:try} · {g:tries} · {g:tried}\ntext: один глагол, пять форм, и теперь ты их говоришь)', 'text: Мы повторили все формы глагола {g:try}: {g:try}, {g:tries}, {g:tried}, {g:will try}, {g:am trying}\ntext: И самое главное: ты уже используешь их в речи!'],
  ['Диалог персонажей логичен', T, 'judge', 'warn', 'text: Теперь про Машу или Андрея: скажи, что он или она пытается что-то сделать', 'text: Маша каждый вечер пытается мне помочь с английским 😅 скажи по-английски: {t:«она пытается помочь»}'],
]

const CHECKLIST_META = [
  ['Не повторяй слова-дополнения', Z, 'judge', 'warn'],
  ['Русские промпты сверить с ответом', Z, 'judge', 'warn'],
  ['В блоке есть задание на слух', V, 'judge', 'warn'],
  ['Похвала по факту', T, 'judge', 'warn'],
  ['Паузы между группами нод', Q, 'judge', 'warn'],
  ['Все «…» по-русски — перевод', S, 'judge', 'error', 'text: {w:«мы попробуем»}', 'text: {t:«мы попробуем»}'],
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
