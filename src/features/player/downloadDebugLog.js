import { getPlayerLines } from '../../shared/lib/debug.js'
import { sendToSink, debugFileName } from '../debugTools/debugSink.js'
import { buildPerfSection } from './perfLogSection.js'

// ВРЕМЕННО (замер лагов урока trying, 2026-09-19): в лог идёт только секция
// производительности, всё остальное заглушено — так файл читается за минуту.
// Вернуть полный лог: поставить false
const PERF_ONLY = true

// Сборка общего дебаг-лога плеера (текст): pLog-строки, таймлайн появления
// нод, загрузки файлов, события анализа. Общая для скачивания и копирования
// в буфер (downloadDebugLog/copyDebugLog), чтобы текст не расходился.
function buildDebugLogText({ nodeAppearLog, debugItems, events }) {
  const ts = new Date().toISOString()
  const playerLines = getPlayerLines()
  const lines = [
    `=== HETA Player Debug Log ===`,
    `ts: ${ts}`,
    `ua: ${navigator.userAgent}`,
    `device: memory=${navigator.deviceMemory ?? 'n/a'} cpu=${navigator.hardwareConcurrency ?? 'n/a'} conn=${navigator.connection?.effectiveType ?? 'n/a'}`,
    ``,
    // Датчик производительности — отдельной секцией вперёд остального: по
    // ней сразу видно, лагало ли и что росло (perfLogSection.js)
    ...buildPerfSection(playerLines),
  ]
  if (PERF_ONLY) return lines.join('\n')
  lines.push(
    ``,
    `--- Player log (pLog) ---`,
    ...playerLines,
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
  )
  return lines.join('\n')
}

// Вынесено из LessonPlayer, чтобы оркестратор не разбухал (лимит 400 строк).
export function downloadDebugLog(logData) {
  // В папку проекта _debug/, а не в Downloads: лог нужен для разбора вместе с
  // кодом, и искать его в загрузках, а потом пересылать — лишний круг. Если
  // dev-сервера нет (прод-превью), debugSink сам скачает файл, как раньше.
  return sendToSink(debugFileName('player-log'), buildDebugLogText(logData))
}

// Копия в буфер обмена — запасной путь рядом со «Скачать»: внутри Telegram
// (frame-ancestors web.telegram.org, см. vercel.json) WebView урока открыт
// именно так, а его встроенный браузер на части устройств тихо игнорирует
// синтетический клик по <a download> с blob: — файл просто не появляется,
// без единой ошибки в консоли. Буфер там, как правило, работает
export async function copyDebugLog(logData) {
  const text = buildDebugLogText(logData)
  await navigator.clipboard.writeText(text)
}
