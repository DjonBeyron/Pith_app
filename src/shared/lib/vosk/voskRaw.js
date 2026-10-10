// «Сырой» результат одной попытки Vosk для админской диагностики (sayDiagRaw.js): что именно вернул движок по словам, что отбросил наш фильтр и почему, чем и как остановились.
// Чистая функция, без React. Текст — только админу в диагностике, звук сюда не попадает.

/**
 * @param {{ rawText: string, stats?: object, cleaned: object, partial?: string, minConf: number, tailWord?: string, tailMinConf?: number }} p
 *   cleaned — результат cleanResult (rows с вердиктом фильтра), stats — статистика voskEngine.startListening (stopBy, tailMs, drainMs, …)
 * @returns {object} raw: { rows: [{word, conf, start, end, need, drop}], rawText (текст итога Vosk как есть), kept (что прошло фильтр и ушло в оценку), partial (последний partial), minConf, tailMinConf, tailWord, stopBy, … }
 */
export function buildRaw({ rawText, stats, cleaned, partial = '', minConf, tailWord = '', tailMinConf = null }) {
  const s = stats ?? {}
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    rows: (cleaned?.rows ?? []).map(w => ({ word: w.word, conf: num(w.conf), start: num(w.start), end: num(w.end), need: w.need ?? null, drop: w.drop ?? null })),
    rawText: String(rawText ?? '').trim(), kept: cleaned?.text ?? '', partial, minConf, tailMinConf, tailWord,
    stopBy: s.stopBy ?? null, tailMs: num(s.tailMs), drainMs: num(s.drainMs), afterStopMs: num(s.afterStopMs), resultMs: num(s.resultMs),
    chunkMs: num(s.chunkMs), maxGapMs: num(s.maxGapMs), lateChunks: num(s.lateChunks), chunks: num(s.chunks), firstPartialMs: num(s.firstPartialMs), gatedMs: num(s.gatedMs),
  }
}
