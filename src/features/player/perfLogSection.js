// Секция «--- Perf ---» для общего дебаг-лога (downloadDebugLog.js): те же
// строки `[perf] …`, что датчик usePerfProbe.js пишет в pLog, но собранные
// в одном месте и со сводкой сверху. В общем потоке pLog они тонут среди
// сотен строк плеера, а смотреть их надо столбиками подряд: рос ли inf/bars
// с каждой нодой и в какую секунду появились фризы.

function num(line, key) {
  const m = line.match(new RegExp(`\\b${key}=(\\d+)`))
  return m ? Number(m[1]) : null
}

export function buildPerfSection(playerLines) {
  const rows = playerLines.filter(l => l.includes('[perf] fps='))
  if (!rows.length) return ['--- Perf ---', '(датчик не писал — диагностический набор был выключен)']

  let minFps = Infinity, drops = 0, maxInf = 0, maxBars = 0, maxAnim = 0, maxAudio = 0, frozen = 0
  for (const l of rows) {
    if (l.includes('HIDDEN')) continue
    const fps = num(l, 'fps')
    if (fps !== null && fps < minFps) minFps = fps
    drops   += num(l, 'drops') ?? 0
    maxInf   = Math.max(maxInf,   num(l, 'inf')   ?? 0)
    maxBars  = Math.max(maxBars,  num(l, 'bars')  ?? 0)
    maxAnim  = Math.max(maxAnim,  num(l, 'anim')  ?? 0)
    maxAudio = Math.max(maxAudio, num(l, 'audio') ?? 0)
    // секунды, где fps ниже 30 — «реально лагало»
    if (fps !== null && fps < 30) frozen++
  }
  return [
    '--- Perf (датчик usePerfProbe, 1 строка = 1 секунда) ---',
    `samples=${rows.length} minFps=${minFps === Infinity ? '-' : minFps} secondsBelow30fps=${frozen} dropsTotal=${drops}`,
    `max: anim=${maxAnim} inf=${maxInf} bars=${maxBars} audio=${maxAudio}`,
    ...rows,
  ]
}
