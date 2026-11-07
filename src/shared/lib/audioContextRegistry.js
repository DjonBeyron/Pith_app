// Реестр ВСЕХ AudioContext страницы (OfflineAudioContext сюда не входит: декодирование аудиосессию не держит). Зачем: iPhone (iOS 18, Safari) после фона/блокировки при заданном
// navigator.audioSession.type деактивирует аудиосессию, а WebKit считает её активной, пока жив ХОТЬ ОДИН медиа-сеанс страницы, — новый контекст тогда 'running', но звука нет.
// Сессию «перезапускает» только закрытие ПОСЛЕДНЕГО контекста (разбор WebKit, moku-labs/game PR #169) — значит, надо знать их все. Обновление сессии — gameAudioRenew.js.
//  • createTracked(kind, opts, { Ctor, onClose }) — создать и записать (kind: game / sounds / capture / level / admin-capture / waveform); onClose(ctx) зовётся СИНХРОННО, когда реестр закрывает
//    контекст сам (closeAll): владелец забывает ссылку и при следующем звуке создаёт новый.
//  • forget(ctx) — владелец закрыл контекст сам; закрытые ('closed') выпадают и без этого.
//  • liveContexts() → [{ kind, ctx, state, createdAt }]; closeAll({ except, only }) → промис { closed, kinds, timedOut, ms } — ждёт и закрытия, начатые прошлым closeAll;
//  • describe() → «game running 12 с, sounds running 29 мин, capture×2 interrupted 3 с» (журнал «[audio] renew …»).
export const CLOSE_WAIT_MS = 600 // close() прерванного контекста на iOS иногда не завершается — дольше не ждём

const records = new Set() // { kind, ctx, createdAt, onClose }
const closing = new Set() // промисы close(), которые ещё идут
let clock = () => globalThis.performance?.now?.() ?? Date.now()

const ctorOf = () => { const g = globalThis; return g.AudioContext || g.webkitAudioContext || g.window?.AudioContext || g.window?.webkitAudioContext || null }
const kindsOf = v => (v == null ? null : new Set([].concat(v)))

/** Создать AudioContext и записать в реестр. Бросает, если Web Audio нет или конструктор упал (как new AudioContext) */
export function createTracked(kind, opts, { Ctor = ctorOf(), onClose = null } = {}) {
  if (!Ctor) throw new Error('нет AudioContext')
  const ctx = opts === undefined ? new Ctor() : new Ctor(opts)
  records.add({ kind, ctx, createdAt: clock(), onClose })
  return ctx
}

/** Владелец закрыл контекст сам — убрать из реестра */
export function forget(ctx) { for (const r of records) if (r.ctx === ctx) records.delete(r) }

function prune() { for (const r of records) if (r.ctx?.state === 'closed') records.delete(r) }

/** Живые (не закрытые) контексты по порядку создания */
export function liveContexts() {
  prune()
  return [...records].map(r => ({ kind: r.kind, ctx: r.ctx, state: r.ctx?.state ?? null, createdAt: r.createdAt }))
}

function closeOne(ctx, waitMs, setTimer, clearTimer) {
  let p
  try { p = Promise.resolve(ctx?.close?.()).catch(() => {}) } catch { p = Promise.resolve() }
  let timer
  const capped = Promise.race([p.then(() => false), new Promise(res => { timer = setTimer(() => res(true), waitMs) })]).then(t => { clearTimer(timer); return t })
  closing.add(capped)
  capped.then(() => closing.delete(capped))
  return capped
}

/**
 * Закрыть контексты: все (по умолчанию) или only (вид / список видов), кроме except (вид / список / функция r → true). Владельцам — onClose сразу, до ожидания.
 * → промис { closed, kinds, timedOut, ms } — когда закрылись и эти, и начатые раньше (или прошло CLOSE_WAIT_MS)
 */
export function closeAll({ except = null, only = null, waitMs = CLOSE_WAIT_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const t0 = clock()
  const onlyK = kindsOf(only), exceptK = typeof except === 'function' ? null : kindsOf(except)
  const skip = r => (onlyK && !onlyK.has(r.kind)) || (exceptK && exceptK.has(r.kind)) || (typeof except === 'function' && except(r))
  prune()
  const list = [...records].filter(r => !skip(r))
  const before = [...closing]
  const waits = []
  for (const r of list) {
    records.delete(r)
    try { r.onClose?.(r.ctx) } catch { /* владелец не должен мешать закрытию */ }
    waits.push(closeOne(r.ctx, waitMs, setTimer, clearTimer))
  }
  return Promise.all([...before, ...waits]).then(res => ({
    closed: list.length, kinds: list.map(r => r.kind), timedOut: res.slice(before.length).filter(Boolean).length, ms: Math.round(clock() - t0),
  }))
}

/** Возраст «12 с» / «29 мин» / «2 ч» */
export function ageText(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} с`
  if (s < 3600) return `${Math.round(s / 60)} мин`
  return `${Math.round(s / 3600)} ч`
}

/** Одна строка для журнала: вид(×N) состояние возраст младшего; пусто — «нет контекстов» */
export function describe(list = liveContexts(), now = clock()) {
  if (!list.length) return 'нет контекстов'
  const groups = new Map()
  for (const r of list) {
    const key = `${r.kind}|${r.state ?? '?'}`
    const g = groups.get(key) ?? { kind: r.kind, state: r.state ?? '?', n: 0, last: -Infinity }
    g.n += 1; g.last = Math.max(g.last, r.createdAt)
    groups.set(key, g)
  }
  return [...groups.values()].map(g => `${g.kind}${g.n > 1 ? `×${g.n}` : ''} ${g.state} ${ageText(now - g.last)}`).join(', ')
}

/** Тесты: очистить реестр и подменить часы */
export function resetRegistry({ now = null } = {}) { records.clear(); closing.clear(); if (now) clock = now }
