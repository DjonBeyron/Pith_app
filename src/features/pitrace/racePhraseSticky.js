// «Липкие» слова быстрого прохода (проход 2 «Скажи», v3.3.342; решение владельца 2026-11-22: «засчитывать слово, которое Vosk слышал в этом же заходе»). Журнал владельца 17:12, «I'm trying to learn»:
// черновик «i'm» (первый отрезок пилюли залит), потом Vosk переписал заход на «trying», «trying to learn» — «i'm» из текста пропало. Заливка в проходе 2 назад не идёт (слово, хоть раз услышанное, остаётся),
// а зачёт считался по итоговому тексту: 3 слова из 4, «фраза неполная» — на экране пилюля залита на 97 %, а фраза не засчитана. Теперь зачёт видит то же, что заливка: слово цели, которое уже было отдано
// сцене (onWord) в этом заходе, остаётся сказанным, даже если Vosk потом потерял его в тексте. Слова закрытых заходов живут столько же, сколько их текст (JOIN_MS слушателя).
// Только проход 2: в проходе 1 «по слову» правила строгие (слово — только по итогу захода, racePhraseTailHold.js). Чистая логика над часами слушателя.
export function createSticky({ now = () => Date.now(), keepMs = 6000, log = null } = {}) {
  let cur = new Map() // ключ кандидата → Set номеров слов, отданных сцене в ТЕКУЩЕМ заходе
  let past = []       // закрытые заходы: [{ at, seen: Map }]
  let told = new Set() // «ключ|номер», про которые уже написано в журнал
  const has = (seen, key, i) => !!seen.get(key)?.has(i)
  return {
    /** Слово i кандидата key отдано сцене (onWord) в текущем заходе */
    add(key, i) { let s = cur.get(key); if (!s) { s = new Set(); cur.set(key, s) } s.add(i) },
    /** Заход Vosk закрыт: его слова живут ещё keepMs (как текст закрытого захода) */
    close() { if (cur.size) past.push({ at: now(), seen: cur }); cur = new Map() },
    /** Разбор по тексту → тот же разбор, где слова, уже отданные сцене, остаются сказанными. words(key) — слова кандидата (для журнала) */
    merge(scores, words = () => []) {
      const t = now(); past = past.filter(p => t - p.at <= keepMs)
      return scores.map(s => {
        let changed = false
        const hits = s.hits.map((h, i) => {
          if (h) return true
          if (!has(cur, s.key, i) && !past.some(p => has(p.seen, s.key, i))) return false
          changed = true
          const k = `${s.key}|${i}`; if (log && !told.has(k)) { told.add(k); log(`[phrase-ear] слово ${i + 1} «${words(s.key)[i] ?? ''}» было услышано в этом заходе, потом Vosk потерял его в тексте — остаётся сказанным (проход 2)`) }
          return true
        })
        if (!changed) return s
        const ok = hits.filter(Boolean).length
        return { ...s, hits, ok, ratio: hits.length ? ok / hits.length : 0 }
      })
    },
    clear() { cur = new Map(); past = []; told = new Set() },
  }
}
