import { normalizeWordCard } from '../../wordCard/wordCardModel.js'

// Три части обменного JSON урока-слова (окно «Поделиться / Импорт»): каждая живёт в файле
// отдельным полем и может ехать как одна, так и все вместе — одним файлом можно собрать
// урок целиком или запросить у модели что-то одно.
//   lesson       — скрипт урока: nodes (+ zones)
//   reviewCards  — колода карточек повтора слова
//   wordCard     — справка слова («карточка слова»)
// Чистые функции без DOM

export const PARTS = [
  { id: 'lesson', label: 'Урок (скрипт)', key: 'nodes' },
  { id: 'reviewCards', label: 'Карточки повтора', key: 'reviewCards' },
  { id: 'wordCard', label: 'Справка слова', key: 'wordCard' },
]
export const ALL_PARTS = { lesson: true, reviewCards: true, wordCard: true }

// Выбор частей из любого вида (нет значения — часть включена, как раньше)
export const normalizeParts = parts => ({ ...ALL_PARTS, ...(parts ?? {}) })

// Что просят вернуть — для легенды: модель не должна добавлять лишнее
export function partsAbout(parts) {
  const names = PARTS.filter(p => parts[p.id]).map(p => `${p.key} (${p.label.toLowerCase()})`)
  return 'Файл состоит из независимых частей: nodes (скрипт урока), reviewCards (карточки повтора слова) и wordCard (справка слова) — '
    + 'каждая необязательна, файл может содержать любую из них или все сразу. '
    + `В этом файле: ${names.join(', ') || 'только заголовок'}. `
    + 'В ответ верни ТОЛЬКО те части, о которых просят: попросили одну — верни файл с одним этим полем (остальные поля не добавляй, '
    + 'format и lesson можно оставить); попросили урок целиком — все три поля в одном файле.'
}

// Правила для легенды: у урока — все; без урока — только те, что про выбранные карточки/справку
export function principlesForParts(principles, parts) {
  if (parts.lesson) return principles
  const keys = [parts.reviewCards && 'reviewCards', parts.wordCard && 'wordCard'].filter(Boolean)
  return keys.length ? principles.filter(t => keys.some(k => t.includes(k))) : []
}

// Что лежит в файле: { lesson, reviewCards, wordCard } — числа (нод / карточек / блоков справки),
// 0 — части нет. Ничего не применяет и не чистит всерьёз — для галочек окна импорта.
// Не JSON → null
export function peekParts(input) {
  let json = input
  if (typeof input === 'string') {
    try { json = JSON.parse(input) } catch { return null }
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const count = v => (Array.isArray(v) ? v.length : 0)
  return {
    lesson: count(json.nodes),
    reviewCards: (Array.isArray(json.reviewCards) ? json.reviewCards : []).filter(c => count(c?.nodes) > 0).length,
    wordCard: normalizeWordCard(json.wordCard)?.nodes.length ?? 0,
  }
}

// Имя файла экспорта: все три части — просто имя урока, иначе в имени видно, что внутри
// (trying.wordCard.json, trying.reviewCards+wordCard.json)
export function exportFileName(title, parts) {
  const base = String(title || 'lesson').replace(/[^\w\-.]+/g, '_')
  const on = PARTS.filter(p => parts[p.id])
  if (on.length === PARTS.length || !on.length) return `${base}.json`
  return `${base}.${on.map(p => (p.id === 'lesson' ? 'lesson' : p.id)).join('+')}.json`
}

// Одной строкой, что разобрано из файла (результат importLesson): для отчёта окна импорта
export function parsedSummary(r) {
  const bits = []
  if (r.has?.lesson) bits.push(`${r.nodes.length} нод, ${r.links} связей`)
  if (r.reviewCards?.length) bits.push(`карточек повтора: ${r.reviewCards.length}`)
  if (r.wordCard) bits.push(`справка слова: блоков ${r.wordCard.nodes.length}`)
  return bits.join(', ')
}
