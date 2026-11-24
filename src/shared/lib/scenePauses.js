// Паузы сценария игры «Встряхни память» как НАСТРОЙКИ (CONCEPT_TIMELINE.md, «Шаг 2: паузы как настройки»). Чистый модуль без React и без сети.
// Реестр SCENE_PAUSES — какие ожидания сцены можно менять без правки кода: key (стабильное имя — им подписана пауза в трассе сцены, событие knob и поле pauses у stage-in),
// title и where (по-русски, для админа), def (мс — РОВНО то, что стояло константой в коде до настроек, v3.3.349), min / max / step (пределы: при min сцена не ломается), group (этап игры).
// Игра читает значение pauseMs(key) В МОМЕНТ ИСПОЛЬЗОВАНИЯ. Без переопределений pauseMs(key) === def — поведение прежнее бит-в-бит (raceStagesBaseline.test.js, scenePausesWiring.test.js).
// Переопределения лежат слоями по источнику, старший перекрывает младший ПО КЛЮЧУ:  server (app_settings.race_scene_pauses, shared/api/scenePausesApi.js — всем игрокам)
//   < device (localStorage pithy_scene_pauses_v1 — «попробовать на этом устройстве») < stand (?pauses= стенда) < manual (setPauseOverrides: тесты и экран).
// Слои только КОПЯТСЯ; действовать они начинают на commitPauses() — его зовёт сборка стадий игры (pitrace/raceStages.buildRaceStages): пауза не меняется посреди игры,
// ответ сервера, пришедший после старта, сработает со следующей игры. Никакого ожидания сети: не пришло — значения по умолчанию.
// Длительности анимаций, страховки-потолки, скорости пилюль и пороги распознавания сюда НЕ входят (см. CONCEPT_TIMELINE.md).
export const PAUSES_V = 1
export const PAUSES_SETTING_KEY = 'race_scene_pauses' // app_settings: { v: 1, pauses: { ключ: мс }, savedAt, by }
export const PAUSES_DEVICE_KEY = 'pithy_scene_pauses_v1' // localStorage: тот же формат
export const PAUSE_SOURCES = ['server', 'device', 'stand', 'manual']
export const PAUSE_SOURCE_NAMES = { server: 'сервер', device: 'это устройство', stand: 'стенд', manual: 'вручную' }

const P = (key, group, def, min, max, title, where, step = 50) => Object.freeze({ key, group, def, min, max, step, title, where })
export const SCENE_PAUSES = Object.freeze([
  P('line.at', 'Старт', 250, 0, 1500, 'Реплика этапа после появления плашки', 'начало стадии (плашка этапа) → Пит начинает её реплику'),
  P('plate.hold', 'Старт', 1200, 300, 4000, 'Плашка этапа после слов Пита', 'Пит договорил про этап → три ноты отсчёта (старт игры и разворот конвейера)'),
  P('count.tail', 'Старт', 200, 0, 2000, 'Тишина после третьей ноты отсчёта', 'третья нота отзвучала → первая пилюля / первый ход'),
  P('race.announce', 'Конвейер слов', 1700, 600, 5000, 'Плашка этапа: сколько держится минимум', 'плашка этапа появилась → не уходит раньше этого времени'),
  P('good.delay', 'Конвейер слов', 500, 150, 2000, 'Похвала после верного слова', 'пилюля взлетела → Пит хвалит'),
  P('afterGood.gap', 'Конвейер слов', 350, 100, 2000, 'Следующее слово после похвалы', 'Пит договорил похвалу → перевод следующего слова'),
  P('preSay.gap', 'Конвейер слов', 450, 150, 2000, 'Следующее слово без похвалы', 'слово принято или «не успел» → перевод следующего слова'),
  P('stage.exit', 'Конвейер слов', 1300, 300, 4000, 'Конец круга', 'последнее слово круга отыграно → следующая стадия'),
  P('mia.intro', 'Допрос у Мии', 0, 0, 3000, 'Заставка перед Мией', 'конец круга → Пит «Некоторые слова забылись» (и вход в экзамен)'),
  P('mia.gap', 'Допрос у Мии', 350, 100, 2000, 'Пауза между репликами Мии и Пита', 'реплика очереди Мии договорена → следующая реплика очереди'),
  P('phrase.lineTail', 'Фразы', 230, 0, 3000, 'Плашка «Фраз» после слов Пита', 'Пит договорил на плашке «Конвейер ситуаций» → пример на живой пилюле (пальцами — три ноты)'),
  P('phrase.exit', 'Фразы', 300, 100, 3000, 'Конец круга фраз', 'круг фраз кончился → следующая стадия (экзамен или итог)'),
  P('boss.pit1At', 'Экзамен', 1650, 1650, 5000, 'Экзамен: первая реплика Пита из коробки', 'вход в экзамен (коробка падает) → Пит начинает говорить'),
])
const BY_KEY = new Map(SCENE_PAUSES.map(p => [p.key, p]))
/** Значения по умолчанию: { ключ: мс } */
export const PAUSE_DEFAULTS = Object.freeze(Object.fromEntries(SCENE_PAUSES.map(p => [p.key, p.def])))

const layers = { server: null, device: null, stand: null, manual: null } // источник → { ключ: мс } (уже проверено) | null
let active = {}    // что действует сейчас: { ключ: мс } — только отличия от умолчаний
let activeFrom = {} // ключ → источник

/** Описание всех пауз (для экрана): [{ key, group, title, where, def, min, max, step, value (действует), source | null }] */
export const listPauses = () => SCENE_PAUSES.map(p => ({ ...p, value: active[p.key] ?? p.def, source: activeFrom[p.key] ?? null }))
export const pauseInfo = key => BY_KEY.get(key) ?? null

/** Проверка набора { ключ: мс } (или настройки целиком { v, pauses }): → { pauses (годное), dropped: [{ key, value, why }] }. Неизвестный ключ, не число, вне пределов — отбрасывается с причиной */
export function validatePauses(obj) {
  const src = obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj.pauses && typeof obj.pauses === 'object' && !Array.isArray(obj.pauses) ? obj.pauses : obj) : null
  const pauses = {}, dropped = []
  if (!src) return { pauses, dropped: obj == null ? [] : [{ key: '', value: obj, why: 'не набор «ключ: мс»' }] }
  for (const [key, value] of Object.entries(src)) {
    const p = BY_KEY.get(key)
    if (!p) { if (src === obj && ['v', 'savedAt', 'by'].includes(key)) continue; dropped.push({ key, value, why: 'нет такой паузы' }); continue }
    if (typeof value !== 'number' || !Number.isFinite(value)) { dropped.push({ key, value, why: 'не число' }); continue }
    if (value < p.min || value > p.max) { dropped.push({ key, value, why: `вне пределов ${p.min}…${p.max} мс` }); continue }
    pauses[key] = Math.round(value)
  }
  return { pauses, dropped }
}

const storage = () => { try { return globalThis.localStorage ?? null } catch { return null } }
/** Переопределения этого устройства (localStorage) → { pauses, dropped } | null (нет записи). Мусор не бросает */
export function readDevicePauses(ls = storage()) {
  try { const raw = ls?.getItem(PAUSES_DEVICE_KEY); return raw ? validatePauses(JSON.parse(raw)) : null } catch { return { pauses: {}, dropped: [{ key: '', value: '', why: 'запись на устройстве не читается' }] } }
}
/** Записать переопределения этого устройства («попробовать у себя»): пустой набор стирает запись. → { ok, pauses, dropped } */
export function saveDevicePauses(obj, ls = storage()) {
  const { pauses, dropped } = validatePauses(obj)
  try {
    if (!Object.keys(pauses).length) ls?.removeItem(PAUSES_DEVICE_KEY)
    else ls?.setItem(PAUSES_DEVICE_KEY, JSON.stringify({ v: PAUSES_V, pauses, savedAt: new Date().toISOString() }))
    return { ok: !!ls, pauses, dropped }
  } catch { return { ok: false, pauses, dropped } }
}
export const clearDevicePauses = (ls = storage()) => saveDevicePauses({}, ls)

/** Параметр стенда ?pauses=: JSON ({"mia.intro":800}) или «ключ=мс,ключ=мс» → { ключ: мс } (без проверки — её делает setPauseOverrides) */
export function parsePausesParam(str) {
  const s = String(str ?? '').trim()
  if (!s) return {}
  if (s.startsWith('{')) { try { const o = JSON.parse(s); return o && typeof o === 'object' ? (o.pauses ?? o) : {} } catch { return {} } }
  return Object.fromEntries(s.split(',').map(x => x.split('=')).filter(a => a.length === 2 && a[0].trim()).map(([k, v]) => [k.trim(), Number(v)]))
}

/** Слить слои в действующий набор. Слой устройства читается здесь же (свежий localStorage). → { pauses, from, changed } */
export function commitPauses({ ls = storage() } = {}) {
  const dev = readDevicePauses(ls)
  layers.device = dev ? dev.pauses : null
  const next = {}, from = {}
  for (const s of PAUSE_SOURCES) for (const [k, v] of Object.entries(layers[s] ?? {})) { if (v !== BY_KEY.get(k).def) { next[k] = v; from[k] = s } else { delete next[k]; delete from[k] } }
  const changed = JSON.stringify(next) !== JSON.stringify(active)
  active = next; activeFrom = from
  return { pauses: { ...active }, from: { ...activeFrom }, changed }
}

/**
 * Положить переопределения источника source (заменяет прежний набор этого источника; null / {} — убрать). commit: false — только запомнить: применится на следующей сборке стадий (так кладёт сервер).
 * → { pauses (принято), dropped }
 */
export function setPauseOverrides(obj, { source = 'manual', commit = true } = {}) {
  const res = validatePauses(obj)
  if (!PAUSE_SOURCES.includes(source) || source === 'device') return { pauses: {}, dropped: [{ key: '', value: source, why: 'нет такого источника (устройство пишется saveDevicePauses)' }] }
  layers[source] = Object.keys(res.pauses).length ? res.pauses : null
  if (commit) commitPauses()
  return res
}
/** Набор { ключ: мс } одной строкой «ключ=мс,ключ=мс» (так он лежит в мете прохождения трассы; читается обратно parsePausesParam) */
export const pausesToParam = obj => Object.entries(obj ?? {}).map(([k, v]) => `${k}=${v}`).join(',')
/** Что действует сейчас: { ключ: мс } — только переопределённое */
export const getPauseOverrides = () => ({ ...active })
/** Набор источника, как он лежит в слое (ещё мог не примениться): { ключ: мс } | null */
export const pauseLayer = source => (layers[source] ? { ...layers[source] } : null)
/** Убрать все переопределения памяти (тесты, «сбросить»); запись устройства не трогает */
export function resetPauses() { for (const s of PAUSE_SOURCES) layers[s] = null; active = {}; activeFrom = {} }

/** Пауза key, мс: действующее переопределение или значение по умолчанию. Неизвестный ключ — 0 (ключи в коде проверяет scenePausesWiring.test.js) */
export const pauseMs = key => active[key] ?? BY_KEY.get(key)?.def ?? 0

/** Строка журнала игры на старте: что переопределено и откуда */
export function pausesLogLine() {
  const keys = Object.keys(active)
  if (!keys.length) return '[pauses] все по умолчанию'
  const src = [...new Set(keys.map(k => activeFrom[k]))].map(s => PAUSE_SOURCE_NAMES[s] ?? s).join(' + ')
  return `[pauses] переопределено ${keys.length}: ${keys.map(k => `${k}=${active[k]} мс (было ${BY_KEY.get(k).def})`).join(', ')}; источник: ${src}`
}
