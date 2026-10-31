// Раздел «Игра «Повтори за диктором»» в общем текстовом журнале плеера (downloadDebugLog.js, кнопка «Лог и версия» в шапке урока): краткая хронология последней игры из её дампа
// (useWordLaneDebug → getLastWordLaneDump). Нужен потому, что владелец присылает именно этот текстовый журнал, а не JSON «Скачать отладку» из игры. Сюда не попадает ничего тяжёлого:
// запись голоса (base64) и уровни громкости пропускаются, длинные строки режутся, а сама хронология ограничена MAX_LINES (начало и конец). Чистые функции — проверяются тестами.
import { diagnoseFirstLine, silentDiagLines } from './modules/rotate-phone/wordLaneSilentDiag.js'
import { audioModeInfo } from '../rehearsal/polish/audioPresets.js'

export const MAX_LINES = 400      // сколько строк хронологии максимум; больше — начало (HEAD_LINES) и конец, середина свёрнута в одну строку
export const HEAD_LINES = 100
export const MAX_FIELD = 140      // длина одного значения в строке
export const MAX_PARTIALS = 120   // черновиков распознавания в хронологии (их сотни; итоги final идут все)

// Какие события пробника (type 'probe') важны для разбора: доступы и звук. audio-tick — отдельным правилом (только смена типа аудиосессии)
const PROBE_KINDS = new Set([
  'probe-install', 'permission', 'gum-call', 'gum-result', 'game-mic', 'track', 'play-call', 'play-result', 'first-sound', 'media-error', 'audio-session', 'mic-hold',
  'audiocontext', 'audiocontext-state', 'visibility', 'fullscreen', 'pagehide', 'pageshow', 'speech-speak', 'speech-event',
  'audio-warm', 'audio-interrupt', 'start-mark', 'plate-sound', // старт звука: тап, микрофон, settle, прогрев, прерывания, плашка (раздел «Почему первая реплика тихая»)
])
const SKIP_TYPES = new Set(['level', 'grammar'])

const short = v => {
  if (v == null) return String(v)
  if (typeof v === 'string') return v.length > MAX_FIELD ? `${v.slice(0, MAX_FIELD)}…(${v.length} симв.)` : v
  if (typeof v !== 'object') return String(v)
  let json = ''
  try { json = JSON.stringify(v) } catch { json = String(v) }
  return json.length > MAX_FIELD ? `${json.slice(0, MAX_FIELD)}…` : json
}

/** Поля события одной строкой: k=v k=v (без t / type / kind) */
export function fields(ev) {
  return Object.entries(ev ?? {}).filter(([k]) => k !== 't' && k !== 'type' && k !== 'kind').map(([k, v]) => `${k}=${short(v)}`).join(' ')
}

/** Строка хронологии: «  12345мс probe:gum-result ok=true ms=230 …» */
export function eventLine(ev) {
  const head = `${String(ev.t ?? '?').padStart(7)}мс ${ev.type}${ev.kind != null ? `:${ev.kind}` : ''}`
  const rest = fields(ev)
  return rest ? `${head} ${rest}` : head
}

/** Отобрать события для хронологии: доступы/звук (probe), стадии, partial/final, пилюли, ворота, ноты, события игры; audio-tick — только при смене аудиосессии */
export function pickEvents(events = []) {
  const out = []
  let lastAs = Symbol('none')
  let partials = 0
  for (const ev of events) {
    if (SKIP_TYPES.has(ev.type)) continue
    if (ev.type === 'probe') {
      if (ev.kind === 'audio-tick') { if (ev.as !== lastAs) { lastAs = ev.as; out.push(ev) } continue }
      if (PROBE_KINDS.has(ev.kind)) out.push(ev)
      continue
    }
    if (ev.type === 'partial') { partials += 1; if (partials > MAX_PARTIALS) continue }
    out.push(ev)
  }
  return out
}

/** Если строк больше MAX_LINES — оставить начало и конец, а середину заменить строкой «… пропущено N …» */
export function clip(lines) {
  if (lines.length <= MAX_LINES) return lines
  const tail = MAX_LINES - HEAD_LINES
  return [...lines.slice(0, HEAD_LINES), `… пропущено ${lines.length - MAX_LINES} строк …`, ...lines.slice(lines.length - tail)]
}

/** Сколько событий каждого типа — одной строкой для шапки раздела */
export function countsLine(events = []) {
  const n = {}
  for (const ev of events) { const k = ev.type === 'probe' ? `probe` : ev.type; n[k] = (n[k] ?? 0) + 1 }
  return Object.entries(n).map(([k, v]) => `${k}:${v}`).join(' ')
}

/** Раздел «Почему первая реплика тихая» (wordLaneSilentDiag.js); сбой диагностики не ломает журнал */
function diagLines(events) {
  try { return [...silentDiagLines(diagnoseFirstLine(events)), ''] } catch { return [] }
}

/** Строка «Режим звука: C — …» (пресеты «Шлифовки репетиции», audioPresets.js): настройки из журнала игры; сбой чтения не ломает журнал */
function audioModeLine(game) {
  try { return `Режим звука: ${audioModeInfo({ game }).line}` } catch { return 'Режим звука: не определён' }
}

/** Строки раздела для журнала плеера; dump — результат getLastWordLaneDump() (или null: игры не было / отладка была выключена) */
export function buildGameLogSection(dump) {
  const title = '--- Игра «Повтори за диктором» (последний запуск) ---'
  if (!dump) return [title, 'нет данных: игра не запускалась в этом сеансе или отладочный интерфейс был выключен', '']
  const events = Array.isArray(dump.events) ? dump.events : []
  const game = dump.mic?.game
  return [
    title,
    `старт: ${dump.startedAt ?? '?'}  фраза: ${dump.phrase || '—'}  перевод: ${dump.translation || '—'}  lang: ${dump.lang || '—'}`,
    `устройство: ${short(dump.device?.ua ?? '')} weak=${dump.device?.weak ?? '?'} экран=${short(dump.device?.screen ?? '')}`,
    `микрофон игры: ${game ? `open=${game.open} platform=${game.platform} processing=${game.processing} audioSession=${game.audioSessionMode} micHold=${game.micHoldMode} tracks=${short(game.tracks)} settings=${short(game.settings)}` : 'не открыт'}`,
    audioModeLine(game),
    `записано: ${events.length} событий (${countsLine(events)}); вытеснено: ${dump.dropped ?? 0}`,
    ...diagLines(events),
    ...clip(pickEvents(events).map(eventLine)),
    '',
  ]
}
