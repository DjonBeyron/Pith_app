// Копилка журналов «Прогона по режимам» («Шлифовка репетиции»): после каждого выхода из игры в браузер (localStorage) кладётся запись запуска — этап, режим звука A…H, настройки микрофона из журнала игры и краткая
// хронология игры (gameLogSection.js: доступы, play(), аудиосессия, стадии, раздел «Почему первая реплика тихая»). Всё копится между запусками (в самой игре журнал одного запуска затирается следующим),
// а «Экспорт прогонов» отдаёт один JSON с краткой сводкой — по нему видно, в каком режиме хрип пропадает. Чистые функции без React и DOM — проверяются тестами.
import { ONLY_TITLES } from '../rehearsalOnly.js'
import { buildGameLogSection } from '../../player/gameLogSection.js'
import { audioModeInfo, presetById, presetInner } from './audioPresets.js'

export const RUNS_KEY = 'pithy_rh_audio_runs_v1'
export const MAX_RUNS = 32
export const MAX_LOG_LINES = 200  // строк хронологии в записи: начало (HEAD_LINES) и конец, середина свёрнута
export const HEAD_LINES = 70
export const RUNS_EXPORT_VERSION = 1
export const RUNS_FILE_NAME = 'rehearsal-audio-runs.json'

/** Строки журнала записи: не больше MAX_LOG_LINES — начало и конец, середина одной строкой */
export function clipLog(lines, max = MAX_LOG_LINES, head = HEAD_LINES) {
  if (lines.length <= max) return lines
  return [...lines.slice(0, head), `… пропущено ${lines.length - max} строк …`, ...lines.slice(lines.length - (max - head))]
}

/** Запись одного запуска. dump — getLastWordLaneDump() (null — отладка выключена); startedAt / endedAt — мс; step — номер шага прогона (с 1) или null (одиночный запуск) */
export function makeRunRecord({ act, presetId, step = null, startedAt = 0, endedAt = 0, dump = null, version = '', store, now = new Date() }) {
  const game = dump?.mic?.game ?? null
  const preset = presetById(presetId)
  return {
    at: now.toISOString(), act, actTitle: ONLY_TITLES[act] ?? act, step, version,
    preset: { id: presetId, title: preset?.title ?? '', inner: presetInner(preset) },
    audioMode: audioModeInfo({ game, store }),
    durationMs: Math.max(0, Math.round((endedAt || 0) - (startedAt || 0))),
    mic: game ? { open: game.open, platform: game.platform, processing: game.processing, audioSession: game.audioSessionMode, micHold: game.micHoldMode } : null,
    gameLog: clipLog(buildGameLogSection(dump)),
  }
}

/** Накопленные записи (старые первыми); нет хранилища / мусор — пусто */
export function listRuns(store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store?.getItem(RUNS_KEY) ?? 'null')
    return Array.isArray(v) ? v.filter(r => r && typeof r === 'object') : []
  } catch { return [] }
}

/** Добавить запись; больше MAX_RUNS — самые старые вытесняются, не помещается в хранилище — тоже. → { ok, count } */
export function addRun(record, store = globalThis.localStorage) {
  let all = [...listRuns(store), record].slice(-MAX_RUNS)
  for (;;) {
    try { store.setItem(RUNS_KEY, JSON.stringify(all)); return { ok: true, count: all.length } } catch {
      if (all.length <= 1) return { ok: false, count: all.length - 1 }
      all = all.slice(1)
    }
  }
}

export function clearRuns(store = globalThis.localStorage) {
  try { store?.removeItem(RUNS_KEY) } catch { /* приватный режим — нечего чистить */ }
}

const sec = ms => `${Math.round(ms / 1000)} с`

/** Сводка текстом (markdown): по строке на запуск */
export function runsSummary(runs, { version = '', exportedAt = '' } = {}) {
  const head = `# Прогон по режимам звука${version ? `, v${version}` : ''}: ${runs.length} запусков${exportedAt ? `, экспорт ${exportedAt}` : ''}`
  const body = runs.map((r, i) => `${i + 1}. [${r.preset?.id ?? '?'}] ${r.actTitle || r.act}${r.step ? ` · шаг ${r.step}` : ''} · ${sec(r.durationMs)} · ${r.audioMode?.line ?? '—'}${r.mic ? ` · микрофон open=${r.mic.open}` : ' · журнала игры нет'}`)
  return [head, ...body].join('\n')
}

/** Содержимое экспорта: { version, appVersion, exportedAt, summary, runs } */
export function buildRunsExport(runs, { version = '', now = new Date() } = {}) {
  const exportedAt = now.toISOString()
  return { version: RUNS_EXPORT_VERSION, appVersion: version, exportedAt, summary: runsSummary(runs, { version, exportedAt }), runs }
}

/** Файл для saveDebugFile (name, json, blob, size) — на iPhone уходит через «Поделиться» */
export function runsFile(runs, { version = '', now = new Date() } = {}) {
  const json = JSON.stringify(buildRunsExport(runs, { version, now }), null, 2)
  const type = 'application/json'
  const blob = typeof File === 'function' ? new File([json], RUNS_FILE_NAME, { type }) : new Blob([json], { type })
  return { name: RUNS_FILE_NAME, json, blob, size: json.length }
}
