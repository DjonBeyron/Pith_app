// Файлы «Таймлайна игры» для отправки логов в GitHub (shared/lib/logUpload.collectLogs, параметры extra / pinned): текстовый отчёт pithy-timeline-<дата>.txt рядом с журналом игры, контекст блока
// pithy-timeline-block-<дата>.txt (комментарий к блоку) и все события прохождения pithy-timeline-run-<дата>.txt (игра, загруженная с сервера). Чистые функции.
import { buildTimeline } from './timelineModel.js'
import { reportText } from './timelineReport.js'

const tag = at => at.toISOString().slice(0, 19).replace(/[:T]/g, '-')

/** Готовый текст отчёта → файл { name, text } */
export const timelineFile = (text, at = new Date()) => ({ name: `pithy-timeline-${tag(at)}.txt`, text })

/** Последнее прохождение из runs (sceneTrace.runs()) → файл отчёта или null, если сцены не было */
export function lastRunFile(runs, { threshold, at = new Date() } = {}) {
  const run = (runs ?? []).findLast?.(r => r.events?.some(e => e.k === 'stage-in' || e.k === 'line-start'))
  return run ? timelineFile(reportText(buildTimeline(run.events, run.meta), { threshold, dropped: run.dropped }), at) : null
}

/** Контекст блока (timelineBlockContext.blockContext().text) → файл для комментария к блоку */
export const blockFile = (text, at = new Date()) => ({ name: `pithy-timeline-block-${tag(at)}.txt`, text })

/** Все события прохождения строками «[scene] {json}» — для игры, загруженной с сервера: живого журнала этой игры на устройстве нет, а разработчику нужна вся трасса (её читает scripts/timeline-from-log.mjs) */
export function runEventsFile(run, { label = '', at = new Date() } = {}) {
  const ev = run?.events ?? []
  if (!ev.length) return null
  const head = [`== СОБЫТИЯ ПРОХОЖДЕНИЯ (трасса сцены) — ${label || run.id || ''} ==`, `событий: ${ev.length}${run.dropped ? `; начало вытеснено: ${run.dropped}` : ''}; устройство: ${run.device ?? '—'}; версия: ${run.appVersion ?? '—'}`]
  return { name: `pithy-timeline-run-${tag(at)}.txt`, text: [...head, ...ev.map(e => `[scene] ${JSON.stringify(e)}`)].join('\n') }
}
