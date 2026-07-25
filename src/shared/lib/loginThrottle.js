// Локальный тормоз перебора пароля: считает неудачные входы и блокирует форму
// на растущее время. Работает в браузере (localStorage), поэтому это НЕ замена
// серверной защите — настоящий лимит стоит на стороне Supabase (Auth → Rate
// Limits) и капчи. Смысл здесь — оборвать «подбор руками/скриптом в консоли
// страницы» на 5-й попытке и не давать форме молотить сервер.

const KEY       = 'pithy_login_guard_v1'
const DEVICE    = '__device'          // счётчик по всему устройству (перебор с разными email)
const FORGET_MS = 60 * 60_000         // час без попыток — счётчик обнуляется
const MAX_KEYS  = 30                  // чтобы хранилище не разрасталось

// Ступени блокировки: с какого числа неудач и на сколько запирать
const STEPS = [
  { fails: 20, lockMs: 2 * 60 * 60_000 },
  { fails: 12, lockMs: 30 * 60_000 },
  { fails: 8,  lockMs: 5 * 60_000 },
  { fails: 5,  lockMs: 60_000 },
]
const DEVICE_STEPS = [
  { fails: 30, lockMs: 2 * 60 * 60_000 },
  { fails: 15, lockMs: 10 * 60_000 },
]

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {} } catch { return {} }
}

function writeAll(all) {
  try {
    // Чистим протухшее и лишнее, чтобы файл не рос бесконечно
    const now = Date.now()
    const fresh = Object.entries(all)
      .filter(([, v]) => now - (v?.lastAt ?? 0) < FORGET_MS || (v?.until ?? 0) > now)
      .sort((a, b) => (b[1]?.lastAt ?? 0) - (a[1]?.lastAt ?? 0))
      .slice(0, MAX_KEYS)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(fresh)))
  } catch { /* приватный режим / переполнение — молча живём без тормоза */ }
}

function normalize(email) {
  return String(email ?? '').trim().toLowerCase()
}

function entryOf(all, key) {
  const e = all[key]
  if (!e) return { fails: 0, lastAt: 0, until: 0 }
  // Давно не пытались — считаем с нуля (но действующую блокировку не снимаем)
  if (Date.now() - (e.lastAt ?? 0) > FORGET_MS && (e.until ?? 0) <= Date.now()) {
    return { fails: 0, lastAt: 0, until: 0 }
  }
  return { fails: e.fails ?? 0, lastAt: e.lastAt ?? 0, until: e.until ?? 0 }
}

function lockMsFor(fails, steps) {
  return steps.find(s => fails >= s.fails)?.lockMs ?? 0
}

// Сколько секунд осталось ждать: 0 — можно пробовать
export function getLoginLockSeconds(email) {
  const all  = readAll()
  const now  = Date.now()
  const until = Math.max(entryOf(all, normalize(email)).until, entryOf(all, DEVICE).until)
  return until > now ? Math.ceil((until - now) / 1000) : 0
}

// Вызывать после КАЖДОГО неудачного входа. Возвращает секунды блокировки (0 — ещё свободно)
export function registerLoginFailure(email) {
  const all = readAll()
  const now = Date.now()
  const key = normalize(email)

  for (const [k, steps] of [[key, STEPS], [DEVICE, DEVICE_STEPS]]) {
    const prev  = entryOf(all, k)
    const fails = prev.fails + 1
    const lock  = lockMsFor(fails, steps)
    all[k] = {
      fails,
      lastAt: now,
      // Уже действующую блокировку не укорачиваем
      until: Math.max(prev.until, lock ? now + lock : 0),
    }
  }
  writeAll(all)
  return getLoginLockSeconds(email)
}

// Успешный вход — забываем неудачи этого email и устройства
export function clearLoginFailures(email) {
  const all = readAll()
  delete all[normalize(email)]
  delete all[DEVICE]
  writeAll(all)
}

// «1:05» / «45 сек» — для подписи под кнопкой
export function formatLockLeft(seconds) {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = String(seconds % 60).padStart(2, '0')
    return `${m}:${s}`
  }
  return `${seconds} сек`
}
