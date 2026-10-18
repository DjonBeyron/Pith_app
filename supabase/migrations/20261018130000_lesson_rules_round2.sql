-- Правила урока, раунд 2 замечаний автора (урок «To»): 4 новых принципа (озвучка верного ответа, порядок ячеек dictator-таблицы, lesson_ref) + правка правила одиночных смайликов (теперь только стикером) и правила S1 (первое сообщение и вопрос — одна сцена).
-- Идемпотентно: принцип вставляется, только если строки с таким началом текста ещё нет; правки существующих — update по началу текста (повтор пишет тот же текст).
-- Текст тот же, что в lessonRulesDefaults.js, структура — как в lessonRulesSeed.js.
do $m$
declare so int;
begin
  select coalesce(max(sort_order), 0) into so from public.lesson_rules where category = 'principle';
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$phrase_assembly: после верной сборки фра$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$phrase_assembly: после верной сборки фраза, пришедшая в чат, озвучивается целиком (сначала звук «верно», голос стартует на ~65% его длительности); отключается voiceAnswer: false, нет поля = включено. Озвучка берётся из библиотеки слов — фразы-ответы phrase_assembly попадают туда автоматически.$r$, so, 'principle', $r$phrase_assembly: озвучить собранную фразу$r$, $r$Голос и сказать$r$, 'judge', 'warn', $r$phrase_assembly (voiceAnswer: false без причины)$r$, $r$phrase_assembly (по умолчанию озвучивается)$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$word_choice: озвучка верного варианта — $r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$word_choice: озвучка верного варианта — поле voiceCorrect (нет поля = включено, если верный вариант английский, и выключено, если русский). Для русских вариантов («Нам нужно уйти») задай voicePhrase — английскую фразу из голосового выше («We need to leave»): без неё включение на русском молчит. Порядок озвучки верного ответа везде один: звук интерфейса, затем голос на ~65% звука.$r$, so, 'principle', $r$word_choice: озвучка верного варианта$r$, $r$Голос и сказать$r$, 'judge', 'warn', $r$word_choice: Нам нужно уйти (voiceCorrect без voicePhrase)$r$, $r$word_choice: Нам нужно уйти (voicePhrase: We need to leave)$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$Dictator-таблица: ячейки идут в порядке $r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$Dictator-таблица: ячейки идут в порядке озвучки (строки сверху вниз, слева направо), а диктор не упоминает слово ячейки раньше её очереди: «to нужен» в пояснении до строки с «to» путает автомонтаж. chatCaption обязателен — это неизменная шапка таблицы, слова диктора в неё не попадают. После правок скрипта таблицу надо перемонтировать кнопкой «Смонтировать».$r$, so, 'principle', $r$Dictator: порядок ячеек и шапка$r$, $r$Таблицы$r$, 'judge', 'warn', $r$table (dictator): «to нужен» в пояснении до строки с to; chatCaption пуст$r$, $r$table (dictator): ячейки по порядку речи; chatCaption: выражаем желание$r$);
  end if;
  so := so + 10;
  if not exists (select 1 from public.lesson_rules where left(rule_text, 40) = $r$Нода lesson_ref без выбранного урока (не$r$) then
    insert into public.lesson_rules (rule_text, sort_order, category, title, rule_group, checker, severity, bad_example, good_example)
    values ($r$Нода lesson_ref без выбранного урока (нет targetId) не оставляется в готовом уроке: плеер такую ноду пропускает целиком вместе с точками «печатает». Реакцию-эмодзи ставь сразу после ответа ученика или реплики, к которой она относится: она садится в пузырь прямо перед ней.$r$, so, 'principle', $r$lesson_ref только с выбранным уроком$r$, $r$Холст и раскладка$r$, 'judge', 'warn', $r$lesson_ref без targetId$r$, $r$lesson_ref с targetId выбранного урока$r$);
  end if;
end
$m$;

update public.lesson_rules
set rule_text = $r$Одиночный смайлик-эмоция (отдельное сообщение) — ТОЛЬКО стикером: нода sticker с imagePrompt (большой стикер, как в Telegram), а не текстовая нода «😋». Стикер описывает эмоцию персонажем, а не просто смайлик. Смайлик внутри фразы («давай на слух 👂») остаётся в тексте. Проверяется линтером: R-emoji-sticker.$r$, title = $r$Одиночный смайлик — только стикером$r$, checker = 'auto', severity = 'warn', bad_example = $r$text: 😋
text: 🥱$r$, good_example = $r$sticker: кот облизывается
sticker: сонный котёнок$r$
where rule_text like 'Одиночные смайлики-эмоции%';

update public.lesson_rules
set rule_text = $r$Сцены, S1. В уроке-слове первая сцена — открывающий кружок Пита: нода scene с mode "circle" и сценой с ОДНИМ котом (characters: { a } без b, кот «Пит»). Первое сообщение урока (история) и вопрос к первому заданию — это реплики ЭТОЙ ЖЕ сцены, а не отдельные audio и photo; кот один в кадре, кадр средний (не крупный и не общий: crop.scale ≈ 0.75). Последняя сцена урока — тоже кружок Пита. Старт и Финал модуля сцен не получают. Проверяется линтером: R-scene-open.$r$
where rule_text like 'Сцены, S1.%';
