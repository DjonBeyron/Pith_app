// Мостик из итога повторения обратно в уроки (PROJECT.md → «Вкладки»:
// «итог повторения → Продолжить *фраза* (60%)»). Из модулей слов сессии —
// тот, что ближе всех к концу, но не пройден целиком.
//
// words: слова сессии; decks: Map(word → { modules: [{ id, title }] });
// curricula: [{ id, title, lesson_ids }]; done: Set пройденных уроков
// → { id, title, pct } | null
export function pickBridge(words, decks, curricula, done) {
  const byId = new Map((curricula ?? []).map(c => [c.id, c]))
  const seen = new Set()
  let best = null
  for (const w of words ?? []) {
    for (const m of decks.get(w)?.modules ?? []) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      const ids = byId.get(m.id)?.lesson_ids
      if (!Array.isArray(ids) || !ids.length) continue
      const pct = Math.round(ids.filter(id => done.has(id)).length / ids.length * 100)
      if (pct >= 100) continue
      if (!best || pct > best.pct) best = { id: m.id, title: m.title, pct }
    }
  }
  return best
}
