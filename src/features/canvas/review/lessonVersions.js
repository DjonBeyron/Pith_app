// Сравнение версий урока в разборе: какие сообщения отличаются от предыдущей версии. Версии хранятся локально (localStorage браузера, ключ — урок).
// Узнаём ноды по id, а если урок переимпортирован из JSON (id новые) — выравниваем по содержимому (LCS по подписям нод): вставки сдвигают номера,
// но «не те» ноды не помечаются. Нода помечена, если она новая, текст/раскраска/варианты изменились, или у неё в предыдущей версии был комментарий.
// Чистые функции, без React. Формат ноды — обмена: { ref, seq, type, data }.

const MAX_VERSIONS = 6

/** Данные ноды без служебных id (у вариантов они генерируются заново при каждом импорте) */
const stripIds = v => {
  if (Array.isArray(v)) return v.map(stripIds)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'id' && k !== 'ref').map(([k, x]) => [k, stripIds(x)]))
  return v
}

const hash = str => {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Отпечаток ноды: тип + всё, что видно ученику (текст, раскраска, варианты, таблица…) — без переходов и позиций */
export const nodeSignature = n => hash(JSON.stringify([n.type, stripIds(n.data ?? {})]))

/** Снимок версии: компактный список [{ id, type, sig, c }] по порядку seq; commented — ref-ы нод, у которых есть комментарии */
export function makeSnapshot(nodes, commented = new Set()) {
  return [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).map(n => ({ id: n.ref, type: n.type, sig: nodeSignature(n), ...(commented.has(n.ref) ? { c: 1 } : {}) }))
}

export const snapshotHash = snap => hash(snap.map(x => `${x.id}:${x.sig}`).join('|'))

/** Самая длинная общая подпоследовательность двух списков подписей → пары индексов [i, j] */
function lcs(a, b) {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i].sig === b[j].sig ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = []
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i].sig === b[j].sig) { out.push([i, j]); i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++
  }
  return out
}

/**
 * Что изменилось между prev и cur (снимки). Результат: Map id текущей ноды → 'new' | 'changed'. Неизменённые ноды в карту не попадают.
 * Нода с комментарием в предыдущей версии (c) считается изменённой, даже если текст тот же.
 */
export function diffSnapshots(prev, cur) {
  const marks = new Map()
  const prevIds = new Map(prev.map(p => [p.id, p]))
  const shared = cur.filter(c => prevIds.has(c.id)).length
  const byId = cur.length > 0 && shared / cur.length >= 0.5
  if (byId) {
    for (const c of cur) {
      const p = prevIds.get(c.id)
      if (!p) marks.set(c.id, 'new')
      else if (p.sig !== c.sig || p.c) marks.set(c.id, 'changed')
    }
    return marks
  }
  // Переимпорт: id другие — выравниваем по содержимому
  const pairs = lcs(prev, cur)
  const matchedCur = new Set(pairs.map(([, j]) => j))
  for (const [i, j] of pairs) if (prev[i].c) marks.set(cur[j].id, 'changed')
  const anchors = [[-1, -1], ...pairs, [prev.length, cur.length]]
  for (let k = 0; k < anchors.length - 1; k++) {
    const pg = prev.slice(anchors[k][0] + 1, anchors[k + 1][0]).map(x => ({ ...x, used: false }))
    for (let j = anchors[k][1] + 1; j < anchors[k + 1][1]; j++) {
      if (matchedCur.has(j)) continue
      const twin = pg.find(x => !x.used && x.type === cur[j].type) // в «окне» между совпадениями нода того же типа — это правка, а не вставка
      if (twin) { twin.used = true; marks.set(cur[j].id, 'changed') } else marks.set(cur[j].id, 'new')
    }
  }
  return marks
}

/** Добавить снимок в стопку версий (если он отличается от верхней); возвращает новую стопку, не больше MAX_VERSIONS */
export function pushVersion(versions, snap, now = Date.now()) {
  const h = snapshotHash(snap)
  if (versions.length && versions[versions.length - 1].h === h) return versions
  return [...versions, { t: now, h, items: snap }].slice(-MAX_VERSIONS)
}

/** Обновить у верхней версии флаги комментариев (когда автор оставил замечания к нодам) */
export function markCommented(versions, commented) {
  if (!versions.length) return versions
  const top = versions[versions.length - 1]
  const items = top.items.map(x => (commented.has(x.id) ? { ...x, c: 1 } : x))
  return [...versions.slice(0, -1), { ...top, items }]
}
