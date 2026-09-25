// Быстро пролистанные фразы ленты (меньше 2 с на экране) — для порядка
// рекомендаций: такая фраза и похожие на неё (общее слово) уходят ниже
// (feedKnowledge.rankFeed). Живут в localStorage устройства 14 дней.
const KEY = 'pithy_feed_skips_v1'
const QUICK_MS = 2000
const TTL_MS = 14 * 86_400_000
const MAX = 60

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function recordFeedView(moduleId, ms, now = Date.now()) {
  if (!moduleId || ms >= QUICK_MS) return
  const list = read().filter(s => s.id !== moduleId && now - s.at < TTL_MS)
  list.push({ id: moduleId, at: now })
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))) } catch { /* приватный режим */ }
}

export function quickSkips(now = Date.now()) {
  return new Set(read().filter(s => now - s.at < TTL_MS).map(s => s.id))
}
