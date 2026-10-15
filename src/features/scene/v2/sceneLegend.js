import { SPRITES } from './sprites/spriteRegistry.js'
import { SLOTS_BY_LOCATION } from './sprites/slots.js'
import { LOCATIONS } from './sprites/backgrounds.js'
import { EMOTIONS, POSES, GENDERS, LIMITS, PALETTE_PRESETS } from './sceneConstants.js'
import { NODE_BUDGET } from './sceneBudget.js'
import { demoCafeScene, demoPitCircleScene } from './demoScenes.js'
import { TASK_LIMITS } from './sceneTask.js'
import { PIT } from './scenePit.js'

// Легенда формата сцены v2 для нейросети и для человека без доступа к коду
// (по образцу NODE_DOCS урока): что за поля, допустимые значения, список
// спрайтов/слотов/якорей, пример валидной сцены и правила хорошего диалога.
// Админ копирует sceneLegendText() в чат с LLM и получает JSON, который
// проходит lintScene. Списки берутся из реестров — легенда не устаревает.

export const SCENE_FIELD_DOCS = {
  version: 'Всегда 2',
  id: 'Короткий латинский идентификатор (буквы, цифры, дефис), например demo-office-work',
  title: `Название сцены по-русски, до ${LIMITS.maxTitleLen} символов`,
  location: `Локация: ${LOCATIONS.join(' | ')}. Задаёт фон и набор слотов для предметов`,
  characters: `Два персонажа: a (стоит слева) и b (стоит справа), оба — коты (kind: "cat"). ИЛИ один кот: characters: { a } БЕЗ поля b — это одиночная сцена, кот стоит по центру. Одиночного кота зовут «${PIT.name}» (a = ${JSON.stringify(PIT)}); он используется в «кружке Пита» — сцене, которая открывает и закрывает урок (1–2 реплики, в ноде урока mode "circle")`,
  'characters.*.gender': `${GENDERS.join(' | ')}. Меняет силуэт и детали: male — шире, кисточки на щеках, ошейник с жетоном; female — стройнее, бантик на ухе, ресницы`,
  'characters.*.name': `Имя по-русски, до ${LIMITS.maxNameLen} символов — показывается в облачке`,
  'characters.*.palette': 'Цвета #rrggbb: fur (шерсть), accent (ухо внутри, нос), belly (грудка/мордочка), eye (радужка), stripe (полоски). Можно взять готовый набор из presets',
  'characters.*.stripes': 'true/false — рисовать ли полоски на теле, лбу и хвосте',
  'characters.*.voice': 'pitch 0…2 (1 — обычный; <1 ниже, >1 выше), rate 0.1…10 (1 — обычный темп) — для запасного синтеза устройства. voiceId, stability 0…1, similarity 0…1, speed 0.7…1.2 — голос ElevenLabs, translationVoiceId — голос для озвучки перевода; выбирает админ в сборщике, нейросеть эти поля НЕ заполняет',
  slots: 'Объект { слот: id предмета | null }. Слоты зависят от локации (см. slots). Предмет можно поставить только в совместимый слот. Пустой слот — null',
  timeline: `Реплики по порядку: от ${LIMITS.minLines} до ${LIMITS.maxLines}; для задания «Повтори»/«Ответь коту» (task.kind repeat/say) достаточно ${LIMITS.minLinesVoice} реплики: кот сказал — зритель повторил или ответил`,
  'timeline[].who': '"a" или "b" — кто говорит; в одиночной сцене (без b) — только "a"',
  'timeline[].text': `Реплика по-русски, до ${LIMITS.maxTextLen} символов, одно-два предложения, со знаком в конце`,
  'timeline[].emotion': `${EMOTIONS.join(' | ')} — лицо говорящего на время реплики (другой кот нейтрален)`,
  'timeline[].pose': `${POSES.join(' | ')} (необязательно; по умолчанию talk). lean — наклон к собеседнику`,
  'timeline[].translation': 'Необязательный перевод реплики на русский (подсказка под репликой; для задания «О чём диалог» — это эталон ответа, у спрашиваемой реплики обязателен)',
  'timeline[].audioUrl': 'НЕ ЗАПОЛНЯТЬ: адрес записанной озвучки ElevenLabs (https на R2 проекта) ставит сборщик кнопкой «Озвучить». Без него реплика озвучивается синтезом речи устройства или идёт по таймеру',
  'timeline[].wordTimings': 'НЕ ЗАПОЛНЯТЬ: [{ word, start, end }] в секундах (сотые) — границы слов для движения рта, приходят от ElevenLabs вместе с файлом',
  'timeline[].audioMeta': 'НЕ ЗАПОЛНЯТЬ: { hash (sha-256 от текста + голоса + настроек + модели), voiceId, durationMs } — по hash сборщик видит, что текст изменили после озвучки, и не озвучивает одно и то же дважды',
  'timeline[].translationAudioUrl / translationWordTimings / translationAudioMeta': 'НЕ ЗАПОЛНЯТЬ: такой же комплект для озвучки перевода (translation) — ставит сборщик',
  options: 'bubbles (показывать облачки, по умолчанию true), autoplay (false), loop (false); display — режим показа текста: none (без облачков), text (оригинал; по умолчанию), both (оригинал + перевод под ним); voice: { original (озвучивать оригинал, по умолчанию true), translation (после оригинала озвучивать перевод «диктором», по умолчанию false) }. display и voice можно выставить по теме: учебный диалог на иностранном — display both и voice.translation true; translationVoiceId — НЕ ЗАПОЛНЯТЬ',
  task: `Необязательное задание после сцены: { kind: "translate" | "say" | "repeat", lineIndex, prompt?, accept, hint?, … }. translate («О чём диалог») — зритель печатает по-русски, что сказал персонаж; ответ сверяется по смыслу с translation реплики и accept. repeat («Повтори за диктором») — зритель вслух повторяет text реплики. say («Ответь коту») — зритель вслух отвечает на реплику-вопрос своими словами на языке оригинала (answers / keywords)`,
  'task.kind': `"translate" (печатать перевод), "say" (ответить голосом) или "repeat" (повторить голосом)`,
  'task.lineIndex': 'Номер спрашиваемой реплики (с 0) или null — тогда последняя реплика с translation. Лучше брать реплику с поворотом сюжета или развязкой',
  'task.prompt': `Вопрос зрителю до ${TASK_LIMITS.maxPrompt} символов; по умолчанию «Что сказал(а) <имя>?»`,
  'task.accept': `До ${TASK_LIMITS.maxAccept} дополнительных допустимых переводов (синонимы, другой порядок слов, разговорная форма), каждый до ${TASK_LIMITS.maxAcceptLen} символов`,
  'task.answers': `Только для kind "say": 1–${TASK_LIMITS.maxAnswers} ожидаемых ответов на языке оригинала (каждый до ${TASK_LIMITS.maxAcceptLen} символов), короткие и естественные; accept — их синонимы`,
  'task.keywords': `Только для kind "say", необязательно: до ${TASK_LIMITS.maxKeywords} ключевых слов; если заданы, ответ засчитывается и по ним (достаточно доли passRatio)`,
  'task.passRatio': 'Для say/repeat, необязательно: доля совпавших слов 0.5..1 (рекомендуется 0.6..0.85, по умолчанию 0.7)',
  'task.strict': 'Для say/repeat, необязательно: true — «Строго», слова должны совпасть точно, без прощения опечаток распознавания',
  'task.hint': `Подсказка после первой неверной попытки, до ${TASK_LIMITS.maxHint} символов (например, о чём реплика в двух словах, без самого ответа)`,
}

// Пример поля task с репликами на изучаемом языке и русскими translation (сцена целиком — ниже, в примере)
export const TASK_EXAMPLE = {
  timeline: [
    { who: 'a', text: 'Did you order the biggest cappuccino again?', emotion: 'surprised', translation: 'Ты опять заказал самый большой капучино?' },
    { who: 'b', text: "It's not big. It's normal. The cup is just small.", emotion: 'neutral', translation: 'Он не большой. Он нормальный. Просто чашка маленькая.' },
  ],
  task: {
    kind: 'translate', lineIndex: 1,
    prompt: 'Что ответил Барсик?',
    accept: ['Это не большой, это нормальный, просто чашка маленькая', 'Капучино нормальный, просто чашка маленькая'],
    hint: 'Он оправдывается размером чашки',
  },
}

// Голосовые виды: say — ответ коту, repeat — повтор за диктором (реплики без translation допустимы)
export const TASK_EXAMPLE_SAY = {
  timeline: [{ who: 'a', text: 'What would you like to drink?', emotion: 'happy' }, { who: 'b', text: 'Tea, please.', emotion: 'neutral' }],
  task: { kind: 'say', lineIndex: 0, prompt: 'Ответь Барсику', answers: ['Tea, please', 'I would like a coffee'], accept: ['Coffee, please'], keywords: ['tea', 'coffee'], hint: 'Назови любой напиток' },
}
export const TASK_EXAMPLE_REPEAT = {
  timeline: [{ who: 'a', text: 'Nice to meet you!', emotion: 'happy' }, { who: 'b', text: 'Nice to meet you too.', emotion: 'happy' }],
  task: { kind: 'repeat', lineIndex: 1, accept: ['Nice to meet you'], hint: 'Скажи так же, как кот' },
}

export const DIALOGUE_RULES = [
  'Два персонажа чередуются; один и тот же кот не говорит больше двух реплик подряд.',
  'Каждая реплика — живая разговорная фраза до 140 символов, лучше до 110: облачко должно читаться с телефона за 2–3 секунды.',
  'Реплика заканчивается знаком препинания. Без эмодзи и без ремарок в скобках — эмоция передаётся полем emotion.',
  'Эмоции меняются по ходу сцены (не одна на всех); surprised — на новость, tired — на жалобу, happy — на шутку/согласие.',
  'У сцены есть мини-сюжет: завязка (1–2 реплики), поворот, развязка-шутка или договорённость в конце.',
  'Предметы в слотах поддерживают тему: про кофе — чашка и кофемашина, про дедлайн — ноутбук и бумаги. Не оставлять все слоты пустыми.',
  'Персонажи должны отличаться: разный пол или цвет шерсти, разные имена и голоса (pitch).',
  `Одиночная сцена (characters: { a } без b, кот «${PIT.name}» по центру) — только когда просят кружок Пита или сцену с одним котом: 1–2 коротких реплики от "a", без задания; Пит обращается к зрителю — открывает урок (тема, вопрос) или закрывает (итог, повтор). Правило чередования к ней не относится.`,
  `Бюджет SVG-узлов сцены ≤ ${NODE_BUDGET}: это ограничивает число занятых слотов (каждый предмет 4–8 узлов, коты ~55 каждый, фон ~10).`,
  'Если просят задание «О чём диалог»: у каждой реплики заполни translation (русский перевод), в task выбери реплику с поворотом или развязкой, дай 2–4 accept с другими формулировками и hint без самого ответа.',
  'Если просят голосовое задание: kind "repeat" — выбери короткую реплику (до 12 слов) для повтора; kind "say" — выбери реплику-вопрос, дай 1–3 ожидаемых ответа в answers на языке оригинала, при желании keywords и hint. Для голосовых видов translation не обязателен. Для repeat/say сцена может состоять из ОДНОЙ реплики (кот сказал — зритель повторил/ответил; говорить может любой из двух котов), диалог из 2+ реплик не обязателен; без задания и для «О чём диалог» нужно минимум 2 реплики.',
  'Поля озвучки audioUrl, wordTimings, audioMeta (и translationAudioUrl, translationWordTimings, translationAudioMeta) и voiceId/translationVoiceId/stability/similarity/speed у голоса не заполняй — их ставит сборщик после генерации ElevenLabs.',
  'Если реплики на иностранном языке — заполни translation у каждой; режим показа и озвучки задавай в options: display "both" (текст + перевод) и voice { translation: true }, когда зрителю нужен перевод, display "text"/"none" — когда это тренировка понимания на слух.',
]

function slotLines(location) {
  return SLOTS_BY_LOCATION[location].map(s => `  - ${s.id} (${s.title}; слой ${s.layer}; якорь ${s.x},${s.y}${s.needs ? `; нужен занятый слот '${s.needs}'` : ''}): ${s.accepts.join(', ')}`)
}

function spriteLines() {
  return SPRITES.filter(s => s.kind === 'prop').map(s => `  - ${s.id} — ${s.title} (${s.category}, ${s.nodeCount} узлов)`)
}

// Единый текст легенды для вставки в чат с нейросетью.
// compact: true — для промпта автора УРОКА: без полей и примеров заданий task (плеер урока их не играет)
// и с примерами в одну строку — остаются формат, предметы/слоты, правила диалога и оба примера
// (одиночная сцена Пита, диалог двух котов)
export function sceneLegendText({ compact = false } = {}) {
  const docs = Object.entries(SCENE_FIELD_DOCS).filter(([k]) => !compact || !k.startsWith('task'))
  const fields = docs.map(([k, v]) => `- ${k}: ${v}`)
  const presets = Object.entries(PALETTE_PRESETS).map(([k, p]) => `  - ${k}: ${JSON.stringify(p)}`)
  return [
    '# Формат сцены Pithy v2 («два кота говорят»)',
    'Собери JSON строго по этой легенде. Ответ — только JSON без пояснений.',
    '',
    '## Поля',
    ...fields,
    '',
    '## Готовые палитры (presets)',
    ...presets,
    '',
    '## Предметы (id — название)',
    ...spriteLines(),
    '',
    ...LOCATIONS.flatMap(loc => [`## Слоты локации ${loc} (слот: что можно поставить)`, ...slotLines(loc), '']),
    '## Правила хорошего диалога',
    ...DIALOGUE_RULES.map((r, i) => `${i + 1}. ${r}`),
    '',
    ...(compact ? [] : [
      '## Пример задания «О чём диалог» (фрагмент: реплики с translation + поле task в той же сцене)',
      JSON.stringify(TASK_EXAMPLE, null, 2),
      '',
      '## Примеры голосовых заданий (kind "say" и "repeat")',
      JSON.stringify(TASK_EXAMPLE_SAY, null, 2),
      JSON.stringify(TASK_EXAMPLE_REPEAT, null, 2),
      '',
    ]),
    `## Пример одиночной сцены — кружок Пита (один кот «${PIT.name}», без b)`,
    JSON.stringify(demoPitCircleScene, null, compact ? 0 : 2),
    '',
    '## Пример валидной сцены',
    JSON.stringify(demoCafeScene, null, compact ? 0 : 2),
  ].join('\n')
}

// Машиночитаемый вариант (для экспорта из админки рядом со сценой)
export function sceneLegend() {
  return {
    format: 'pithy-scene', version: 2,
    fields: SCENE_FIELD_DOCS,
    enums: { location: LOCATIONS, gender: GENDERS, emotion: EMOTIONS, pose: POSES },
    limits: { ...LIMITS, nodeBudget: NODE_BUDGET },
    palettes: PALETTE_PRESETS,
    sprites: SPRITES.filter(s => s.kind === 'prop').map(({ id, title, category, nodeCount, slots }) => ({ id, title, category, nodeCount, slots })),
    slots: SLOTS_BY_LOCATION,
    rules: DIALOGUE_RULES,
    example: demoCafeScene,
    soloExample: demoPitCircleScene,
    pit: PIT,
    taskExample: TASK_EXAMPLE,
    taskExamples: { translate: TASK_EXAMPLE, say: TASK_EXAMPLE_SAY, repeat: TASK_EXAMPLE_REPEAT },
  }
}
