// «Липкие» слова быстрого прохода (проход 2 «Скажи», v3.3.342; решение владельца 2026-11-22: «засчитывать слово, которое Vosk слышал в этом же заходе»). Журнал владельца 17:12, «I'm trying to learn»:
// черновик «i'm» (первый отрезок пилюли залит), потом Vosk переписал заход на «trying», «trying to learn» — «i'm» из текста пропало. Заливка в проходе 2 назад не идёт (слово, хоть раз услышанное, остаётся),
// а зачёт считался по итоговому тексту: 3 слова из 4, «фраза неполная» — на экране пилюля залита на 97 %, а фраза не засчитана. Теперь зачёт видит то же, что заливка: слово цели, которое уже было отдано
// сцене (onWord) в этом заходе, остаётся сказанным, даже если Vosk потом потерял его в тексте. Слова закрытых заходов живут столько же, сколько их текст (JOIN_MS слушателя).
// СЛОВА ПОСЛЕ РАЗРЫВА НЕ ЛИПНУТ (2026-11-28): липким может быть только слово из непрерывного начала фразы; сказанное после неверного / пропущенного слова не хранится.
// Только проход 2: в проходе 1 «по слову» правила строгие (слово — только по итогу захода, racePhraseTailHold.js). Чистая логика над часами слушателя.
import { scorePhrases } from './racePhraseScore.js'

/** Разбор прохода 2: строгая цепочка от «липкого» начала (sticky.prefix); в журнал — слова, потерянные в тексте */
export function stickyScore(sticky, phrases, heard, open) {
  const text = scorePhrases(phrases, heard, { strict: true, base: () => 0, open }), ok = key => text.find(x => x.key === key)?.ok ?? 0
  const res = scorePhrases(phrases, heard, { strict: true, base: key => (sticky.prefix(key) > ok(key) ? sticky.prefix(key) : 0), open }) // липкое начало нужно, только если текст его потерял (иначе повтор слова во фразе «you and you» искался бы с начала текста)
  sticky.note(text, res, key => phrases.find(p => p.key === key)?.words ?? []); return res
}

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
    /** Сколько слов с начала кандидата key непрерывно «липкие» (отданы сцене в этом / недавних заходах): от этой границы строгая цепочка (strictHits) ищет следующее слово. Слова ПОСЛЕ разрыва сюда не попадают
     * (решение владельца 2026-11-28: слова после неверного / пропущенного слова не хранятся — их надо сказать заново), поэтому «липкое» слово — только такое, перед которым нет дыры */
    prefix(key) {
      const t = now(); past = past.filter(p => t - p.at <= keepMs)
      let k = 0; while (has(cur, key, k) || past.some(p => has(p.seen, key, k))) k++
      return k
    },
    /** Журнал: слова, которых нет в тексте, но они в «липком» префиксе (text — разбор без липкого начала, scores — итоговый). words(key) — слова кандидата */
    note(text, scores, words = () => []) {
      if (!log) return
      scores.forEach(s => s.hits.forEach((h, i) => {
        if (!h || text.find(x => x.key === s.key)?.hits[i]) return
        const k = `${s.key}|${i}`; if (told.has(k)) return; told.add(k)
        log(`[phrase-ear] слово ${i + 1} «${words(s.key)[i] ?? ''}» было услышано в этом заходе до пропуска, потом Vosk потерял его в тексте — остаётся сказанным (проход 2)`)
      }))
    },
    clear() { cur = new Map(); past = []; told = new Set() },
  }
}
