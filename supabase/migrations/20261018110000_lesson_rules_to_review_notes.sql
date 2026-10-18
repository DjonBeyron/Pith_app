-- Правила урока по разбору замечаний автора (урок «To»): 9 новых принципов + правка примера «ответить ей» → «ответить Маше».
-- Идемпотентно: правило вставляется, только если строки с таким началом текста ещё нет; правка примера — точная замена фразы.
-- Текст тот же, что в lessonRulesDefaults.js, структура — как в lessonRulesSeed.js.
do $m$
declare so int;
begin
  select coalesce(max(sort_order), 0) into so from public.lesson_rules where category = 'principle';
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$Перевод после ответа: если до задания пе$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$Перевод после ответа: если до задания перевод не объявлен (варианты английские — «to / too / at», «I need to eat»), то после верного ответа ставь короткую живую реплику с переводом: «даа)) это переводится как {t:«…»}» (перевод — белым курсивом, как всегда). Исключение: если сам модуль уже даёт перевод (варианты ответа русские — «Мы любим танцевать»; в подписи фото есть «…») — перевод не повторяй.$r$, so, 'principle', $r$Перевод после ответа, если не объявлен$r$, $r$Задания$r$, 'judge', 'warn', $r$word_choice: to / too / at
text: В точку)$r$, $r$word_choice: to / too / at
text: даа)) это переводится как {t:«мне нужно отдохнуть»}$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$Реакция не описывает механику урока и не$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$Реакция не описывает механику урока и не выдаёт пол: не «Собрал фразу с конца 🔥», «Ритм поймал 👌», а то, что сказал бы друг в чате: «вот так оно и строится)», «ага, поехали дальше 😄». Проверяется линтером: R-gender.$r$, so, 'principle', $r$Реакция не описывает механику$r$, $r$Тон и общение$r$, 'auto', 'warn', $r$text: Собрал фразу с конца 🔥$r$, $r$text: вот так оно и строится)$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$«Вот и всё», «на этом всё», «готово», «з$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$«Вот и всё», «на этом всё», «готово», «закончили» — только в блоке Финал. Посреди урока (между уровнями, после ловушек) такая фраза звучит так, будто урок уже закончился: здесь говори «идём дальше», «ещё одна ловушка», «следующий уровень».$r$, so, 'principle', $r$«Вот и всё» — только в финале$r$, $r$Последовательности$r$, 'judge', 'warn', $r$text: вот кста и всё) (в середине урока)$r$, $r$text: ещё одна ловушка, «я тебе позвоню»$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$Если в сообщениях выше сказано «соберём $r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$Если в сообщениях выше сказано «соберём фразу с конца» голосом (цепочка say_phrase кусок за куском), то и целая фраза в конце собирается ГОЛОСОМ: перед ней фото с подписью (что сказать), затем say_phrase, а не phrase_assembly. Обещали голос, а дали кнопки — ученик чувствует подмену.$r$, so, 'principle', $r$Обещали голос — собираем голосом$r$, $r$Голос и сказать$r$, 'judge', 'warn', $r$say_phrase: to the park
say_phrase: go to the park
phrase_assembly: We go to the park$r$, $r$say_phrase: to the park
say_phrase: go to the park
photo: собери «мы идём в парк»
say_phrase: We go to the park$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$В упражнениях на служебное слово (to, wi$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$В упражнениях на служебное слово (to, with, the…) каждое задание требует решения именно про это слово: нужно оно тут или нет. Не «I will ___ you: call / to call / calling» (выбор формы глагола — to не тренируется даже косвенно), а «I will ___ call you: ничего не нужно / to» или «I can help: I can to help / I can help / I can helps».$r$, so, 'principle', $r$Задание на служебное слово — про само слово$r$, $r$Задания$r$, 'judge', 'warn', $r$word_choice: I will ___ you (call / to call / calling)$r$, $r$word_choice: I will ___ call you (ничего не нужно / to)$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$Последний уровень практики открывай смай$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$Последний уровень практики открывай смайлом-эмоцией следом за системной плашкой («Уровень N · …»): 😲 в шоке с открытым ртом — «дошёл до последнего». По общему правилу одиночных смайлов: чаще стикером, иногда текстом.$r$, so, 'principle', $r$Последний уровень — смайл-эмоция$r$, $r$Тон и общение$r$, 'judge', 'warn', $r$system: Уровень 5 · своими словами
text: длинное предложение…$r$, $r$system: Уровень 5 · своими словами
sticker: кот в шоке$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$type_word: для слов с городом, страной и$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$type_word: для слов с городом, страной или именем («go to Paris», «talk to Masha») extraLetters НЕ задавай — на клавиатуре остаются только буквы слова, без запутывателей. Проверяется линтером: R-type-place.$r$, so, 'principle', $r$type_word: города и имена без ловушек$r$, $r$Задания$r$, 'auto', 'warn', $r$type_word: go to Paris (extraLetters: ln)$r$, $r$type_word: go to Paris (extraLetters не задан)$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$type_word с фразой из 2+ слов получает а$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$type_word с фразой из 2+ слов получает автоподсказку: после первой неверной попытки в чат мягко приходит подсказка про первое неверное слово (слова урока — по названию урока — не подсказываются). Приоритет: signals по букве → автоподсказка → responseWrong; responseWrong пиши как общий текст на случай, когда автоподсказки нет (например, ошибка в слове урока). wordHints: false отключает автоподсказку.$r$, so, 'principle', $r$type_word: автоподсказка по слову$r$, $r$Сигналы$r$, 'judge', 'warn', $r$type_word: talk to Masha
responseWrong: не то) нужно слово говорить, мостик и имя$r$, $r$type_word: talk to Masha
wordHints: по умолчанию, responseWrong — общий текст$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$Dictator-таблица: метка «Проверить» (isC$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$Dictator-таблица: метка «Проверить» (isCheck) всегда ПОСЛЕ последней озвученной ячейки и слова, а длина озвучки в timelineLen должна быть известна — иначе монтаж собирается на одной секунде: таблица «уезжает», проверка запускается посреди речи диктора. Таблица, которая ничего не проверяет (чистая демонстрация), — mode demo, а не dictator.$r$, so, 'principle', $r$Dictator: «Проверить» после озвучки$r$, $r$Таблицы$r$, 'auto', 'warn', $r$table (dictator): isCheck на 0.7 с при озвучке 11 с$r$, $r$table (dictator): isCheck после последней ячейки, timelineLen = длине озвучки$r$);
  end if;
end
$m$;

update public.lesson_rules
set rule_text = replace(rule_text, '(«ответить ей», «поехать в Париж»). Сомневаешься', '(«ответить Маше», «поехать в Париж»): местоимение без контекста («ответить ей») звучит оторвано — называй человека. Сомневаешься')
where rule_text like 'Примеры в заданиях естественные для живой речи%';
