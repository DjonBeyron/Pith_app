// Текстовый отчёт таймлайна файлом для отправки логов в GitHub (shared/lib/logUpload.collectLogs, параметр extra): pithy-timeline-<дата>.txt рядом с журналом игры. Чистые функции.
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
