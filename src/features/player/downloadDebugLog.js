import { getPlayerLines } from '../../shared/lib/debug.js'

// Сборка и скачивание общего дебаг-лога плеера (кнопка в PlayerTopBar):
// pLog-строки, таймлайн появления нод, загрузки файлов, события анализа.
// Вынесено из LessonPlayer, чтобы оркестратор не разбухал (лимит 400 строк).
export function downloadDebugLog({ nodeAppearLog, debugItems, events }) {
  const ts = new Date().toISOString()
  const lines = [
    `=== Pithy Player Debug Log ===`,
    `ts: ${ts}`,
    `ua: ${navigator.userAgent}`,
    `device: memory=${navigator.deviceMemory ?? 'n/a'} cpu=${navigator.hardwareConcurrency ?? 'n/a'} conn=${navigator.connection?.effectiveType ?? 'n/a'}`,
    ``,
    `--- Player log (pLog) ---`,
    ...getPlayerLines(),
    ``,
    `--- Node timeline ---`,
    ...nodeAppearLog.map(n =>
      `seq=${n.seq} type=${n.type} at=${n.appearTs} blobReady=${n.blobReady} evicted=${n.blobEvicted} error=${n.blobError}`
    ),
    ``,
    `--- Downloads ---`,
    ...debugItems.map(d =>
      `#${d.seq} ${d.type} ${d.status} http=${d.httpStatus ?? '-'} ${d.sizeKb ?? '-'}KB start=${d.startTs} ready=${d.readyTs} msg=${d.msgTs ?? '-'} ${d.error ?? ''}`
    ),
    ``,
    `--- Stats events (анализ знаний) ---`,
    ...events.map(e =>
      `${e.type} урок=${e.lessonId} попытка=${e.attempt} время=${e.timeMs ?? '?'}мс «${e.option}» сессия=${e.sessionId}`
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `pithy-debug-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
}
