import { SPRITES } from './sprites/spriteRegistry.js'
import { SLOTS_BY_LOCATION } from './sprites/slots.js'
import { LOCATIONS } from './sprites/backgrounds.js'
import { EMOTIONS, POSES, GENDERS, LIMITS, PALETTE_PRESETS } from './sceneConstants.js'
import { NODE_BUDGET } from './sceneBudget.js'
import { demoCafeScene } from './demoScenes.js'

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
  characters: 'Ровно два персонажа: a (стоит слева) и b (стоит справа). Оба — коты (kind: "cat")',
  'characters.*.gender': `${GENDERS.join(' | ')}. Меняет силуэт и детали: male — шире, кисточки на щеках, ошейник с жетоном; female — стройнее, бантик на ухе, ресницы`,
  'characters.*.name': `Имя по-русски, до ${LIMITS.maxNameLen} символов — показывается в облачке`,
  'characters.*.palette': 'Цвета #rrggbb: fur (шерсть), accent (ухо внутри, нос), belly (грудка/мордочка), eye (радужка), stripe (полоски). Можно взять готовый набор из presets',
  'characters.*.stripes': 'true/false — рисовать ли полоски на теле, лбу и хвосте',
  'characters.*.voice': 'pitch 0…2 (1 — обычный; <1 ниже, >1 выше), rate 0.1…10 (1 — обычный темп), voiceId — зарезервировано под ElevenLabs',
  slots: 'Объект { слот: id предмета | null }. Слоты зависят от локации (см. slots). Предмет можно поставить только в совместимый слот. Пустой слот — null',
  timeline: `Реплики по порядку: от ${LIMITS.minLines} до ${LIMITS.maxLines}`,
  'timeline[].who': '"a" или "b" — кто говорит',
  'timeline[].text': `Реплика по-русски, до ${LIMITS.maxTextLen} символов, одно-два предложения, со знаком в конце`,
  'timeline[].emotion': `${EMOTIONS.join(' | ')} — лицо говорящего на время реплики (другой кот нейтрален)`,
  'timeline[].pose': `${POSES.join(' | ')} (необязательно; по умолчанию talk). lean — наклон к собеседнику`,
  'timeline[].translation': 'Необязательный перевод/подсказка под репликой (для уроков языка)',
  'timeline[].audioUrl': 'Необязательно: адрес заранее записанной озвучки. Без него реплика озвучивается синтезом речи устройства или идёт по таймеру',
  'timeline[].wordTimings': 'Необязательно, вместе с audioUrl: [{ word, start, end }] в секундах — границы слов для движения рта',
  options: 'bubbles (показывать облачки, по умолчанию true), autoplay (false), loop (false)',
}

export const DIALOGUE_RULES = [
  'Два персонажа чередуются; один и тот же кот не говорит больше двух реплик подряд.',
  'Каждая реплика — живая разговорная фраза до 140 символов, лучше до 110: облачко должно читаться с телефона за 2–3 секунды.',
  'Реплика заканчивается знаком препинания. Без эмодзи и без ремарок в скобках — эмоция передаётся полем emotion.',
  'Эмоции меняются по ходу сцены (не одна на всех); surprised — на новость, tired — на жалобу, happy — на шутку/согласие.',
  'У сцены есть мини-сюжет: завязка (1–2 реплики), поворот, развязка-шутка или договорённость в конце.',
  'Предметы в слотах поддерживают тему: про кофе — чашка и кофемашина, про дедлайн — ноутбук и бумаги. Не оставлять все слоты пустыми.',
  'Персонажи должны отличаться: разный пол или цвет шерсти, разные имена и голоса (pitch).',
  `Бюджет SVG-узлов сцены ≤ ${NODE_BUDGET}: это ограничивает число занятых слотов (каждый предмет 4–8 узлов, коты ~55 каждый, фон ~10).`,
]

function slotLines(location) {
  return SLOTS_BY_LOCATION[location].map(s => `  - ${s.id} (${s.title}; слой ${s.layer}; якорь ${s.x},${s.y}${s.needs ? `; нужен занятый слот '${s.needs}'` : ''}): ${s.accepts.join(', ')}`)
}

function spriteLines() {
  return SPRITES.filter(s => s.kind === 'prop').map(s => `  - ${s.id} — ${s.title} (${s.category}, ${s.nodeCount} узлов)`)
}

// Единый текст легенды для вставки в чат с нейросетью
export function sceneLegendText() {
  const fields = Object.entries(SCENE_FIELD_DOCS).map(([k, v]) => `- ${k}: ${v}`)
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
    '## Пример валидной сцены',
    JSON.stringify(demoCafeScene, null, 2),
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
  }
}
