// Сравнение версий урока в разборе: какие сообщения отличаются от предыдущей версии. Версии хранятся локально (localStorage браузера, ключ — урок).
// Узнаём ноды по id, а если урок переимпортирован из JSON (id новые) — выравниваем по содержимому: общие начало и конец, LCS середины и «перенесённые»
// ноды (то же содержимое в другом месте). Нода помечена, если она новая, текст/раскраска/варианты изменились, или у неё в предыдущей версии был комментарий.
// Подпись ноды не зависит от порядка ключей (сервер хранит урок в jsonb и переставляет их), от пустых значений и файловых полей — иначе один и тот же урок
// «до» (с сервера) и «после» (свежий импорт) выглядел разным и подсвечивалось почти всё. Чистые функции, без React. Формат ноды — обмена: { ref, seq, type, data }.

const MAX_VERSIONS = 10
/** Версия схемы подписи. Снимки старых схем сравнивать нельзя (подписи другие) — они отбрасываются, иначе первое сравнение после обновления подсветило бы всё */
export const SIG_VERSION = 2
/** Больше клеток таблицы LCS (длина середины × длина середины) — не строим (память и время): ищем только перенесённые и одинаковые ноды */
const FULL_ALIGN_LIMIT = 4_000_000
// Файл — не содержание сообщения (тот же список, что при экспорте урока, exportLesson.js)
const FILE_FIELDS = new Set(['file_id', 'photoUrl', 'waveformData', 'wordTimings', 'duration', 'audioClips'])

const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)

/** Канонический вид данных ноды: без id/ref (у вариантов они новые при каждом импорте) и файловых полей, без пустых значений, ключи по алфавиту */
const canon = v => {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) {
      if (k === 'id' || k === 'ref' || FILE_FIELDS.has(k)) continue
      const x = canon(v[k])
      if (!isEmpty(x)) out[k] = x
    }
    return out
  }
  return v
}

const hash = str => {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Отпечаток ноды: тип + всё, что видно ученику (текст, раскраска, варианты, таблица…) — без переходов, позиций, файлов и порядка ключей */
export const nodeSignature = n => hash(JSON.stringify([n.type, canon(n.data ?? {})]))

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

/** Монотонные пары [i, j] одинаковых нод (якоря): общее начало, LCS середины (если она не огромная), общий конец */
function anchorPairs(prev, cur) {
  const n = prev.length, m = cur.length
  let lo = 0
  while (lo < n && lo < m && prev[lo].sig === cur[lo].sig) lo++
  let hi = 0
  while (hi < n - lo && hi < m - lo && prev[n - 1 - hi].sig === cur[m - 1 - hi].sig) hi++
  const out = []
  for (let k = 0; k < lo; k++) out.push([k, k])
  const a = prev.slice(lo, n - hi), b = cur.slice(lo, m - hi)
  if (a.length && b.length && a.length * b.length <= FULL_ALIGN_LIMIT) for (const [i, j] of lcs(a, b)) out.push([i + lo, j + lo])
  for (let k = hi; k > 0; k--) out.push([n - k, m - k])
  return out
}

/** Перенесённые ноды: то же содержимое, но не на «монотонном» пути (блок переехал в другое место) — это не новое. Пары по порядку появления */
function movedPairs(prev, cur, anchors) {
  const usedP = new Set(anchors.map(p => p[0])), usedC = new Set(anchors.map(p => p[1]))
  const queues = new Map()
  prev.forEach((p, i) => { if (!usedP.has(i)) { const q = queues.get(p.sig); if (q) q.list.push(i); else queues.set(p.sig, { list: [i], at: 0 }) } })
  const out = []
  cur.forEach((c, j) => {
    if (usedC.has(j)) return
    const q = queues.get(c.sig)
    if (q && q.at < q.list.length) out.push([q.list[q.at++], j])
  })
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
  const anchors = anchorPairs(prev, cur)
  const moved = movedPairs(prev, cur, anchors)
  const matchedPrev = new Set(), matchedCur = new Set()
  for (const [i, j] of [...anchors, ...moved]) {
    matchedPrev.add(i); matchedCur.add(j)
    if (prev[i].c) marks.set(cur[j].id, 'changed')
  }
  const bounds = [[-1, -1], ...anchors, [prev.length, cur.length]]
  for (let k = 0; k < bounds.length - 1; k++) {
    // «окно» между совпадениями: непарная нода того же типа в нём — это правка, а не вставка
    const twins = new Map()
    for (let i = bounds[k][0] + 1; i < bounds[k + 1][0]; i++) {
      if (matchedPrev.has(i)) continue
      const q = twins.get(prev[i].type)
      if (q) q.list.push(i); else twins.set(prev[i].type, { list: [i], at: 0 })
    }
    for (let j = bounds[k][1] + 1; j < bounds[k + 1][1]; j++) {
      if (matchedCur.has(j)) continue
      const q = twins.get(cur[j].type)
      if (q && q.at < q.list.length) { q.at++; marks.set(cur[j].id, 'changed') } else marks.set(cur[j].id, 'new')
    }
  }
  return marks
}

/** Только версии с актуальной схемой подписи (старые отбрасываем, чтобы не сравнивать несравнимое) */
export const keepCurrentVersions = list => (Array.isArray(list) ? list : []).filter(v => v?.sv === SIG_VERSION && Array.isArray(v.items))

/** Добавить снимок в стопку версий (если он отличается от верхней); возвращает новую стопку, не больше MAX_VERSIONS */
export function pushVersion(versions, snap, now = Date.now()) {
  const list = keepCurrentVersions(versions)
  const h = snapshotHash(snap)
  if (list.length && list[list.length - 1].h === h) return list
  return [...list, { t: now, h, sv: SIG_VERSION, items: snap }].slice(-MAX_VERSIONS)
}

/** Обновить у верхней версии флаги комментариев (когда автор оставил замечания к нодам) */
export function markCommented(versions, commented) {
  if (!versions.length) return versions
  const top = versions[versions.length - 1]
  const items = top.items.map(x => (commented.has(x.id) ? { ...x, c: 1 } : x))
  return [...versions.slice(0, -1), { ...top, items }]
}
