// Пит в коробке без Мии (владелец, v3.3.290: «если допрос пройден плохо — Мия выпрыгивает без коробки, Пит: «она ушла? попробуй помочь мне выбраться»; нужно два раза свайпнуть или два раза тапнуть по коробке, и она отлетает;
// один раз — снятие блокируем, Пит: «попробуй быстрее»; провести пальцем нужно чуть-чуть»). Чистое правило касаний без DOM и таймеров: любое нажатие на зону коробки (тап или начало свайпа) — одно касание;
// FREE_HITS касаний подряд, каждое не позже FREE_WINDOW_MS после первого, снимают коробку. Одно касание, за которым второго не пришло, — «попробуй быстрее» (счёт с нуля).
export const FREE_HITS = 2
export const FREE_WINDOW_MS = 1100
export const FREE_WATCHDOG_MS = 30000 // не справились (или играют без касаний): коробку снимаем сами, чтобы игра не зависла на финале

export function createBoxFree({ hits = FREE_HITS, windowMs = FREE_WINDOW_MS } = {}) {
  let n = 0, first = 0, done = false
  return {
    /** Касание коробки в момент now → 'one' (первое — окно открыто), 'free' (набрано — коробка снимается), 'done' (уже снята) */
    hit(now) {
      if (done) return 'done'
      if (n && now - first > windowMs) n = 0
      if (!n) first = now
      n += 1
      if (n >= hits) { done = true; return 'free' }
      return 'one'
    },
    /** Таймер после касания: окно прошло, а набрать не успели → true (Пит просит быстрее; счёт сброшен) */
    expired(now) { if (!done && n && now - first > windowMs) { n = 0; return true } return false },
    isDone: () => done,
  }
}

// Игрок бездействует (владелец 2026-11-25, журнал игры: «Помоги её приподнять — если бездействовать, реплика повторяется»; в его игре просьба прозвучала ОДИН раз, дальше 12 с тишины до паузы):
// Пит повторяет «Не получается, коробка тяжёлая, помоги её приподнять», когда после конца ЕГО РЕЧИ и последнего касания прошло NUDGE_IDLE_MS тишины, но не больше NUDGE_MAX раз — потом коробку снимает сторож.
// Счёт от событий (конец реплики, касание), а не от длины файла: 3,6 с реплика + 9 с тишины → повтор ≈ на 12,6 с, второй ≈ на 25,2 с, сторож на 30 с.
export const NUDGE_IDLE_MS = 9000 // столько тишины без касаний — и Пит просит ещё раз
export const NUDGE_MAX = 2        // повторов не больше

/** Состояние повтора просьбы: idleFrom — с какого момента тишина, n — сколько раз уже повторили */
export const nudgeInit = now => ({ idleFrom: now, n: 0 })
/** Шаг опроса: busy — Пит (или Мия) сейчас говорит или реплика в очереди, touchedAt — момент последнего касания коробки (performance.now; нет — −∞). → { st, say } — say: пора повторить просьбу */
export function nudgeStep(st, { now, busy = false, touchedAt = -Infinity, idleMs = NUDGE_IDLE_MS, max = NUDGE_MAX }) {
  const idleFrom = busy ? now : Math.max(st.idleFrom, touchedAt)
  if (busy || st.n >= max || now - idleFrom < idleMs) return { st: idleFrom === st.idleFrom ? st : { ...st, idleFrom }, say: false }
  return { st: { idleFrom: now, n: st.n + 1 }, say: true }
}

/** Набор таймеров стадии: later(fn, ms) — отложить, clear() — снять ВСЕ (пауза, выход из стадии): снятый таймер не срабатывает никогда. size() — сколько ждут */
export function createTimers(setTimer = setTimeout, clearTimer = clearTimeout) {
  const set = new Set()
  return { later(fn, ms) { const t = setTimer(() => { set.delete(t); fn() }, ms); set.add(t) }, clear() { set.forEach(clearTimer); set.clear() }, size: () => set.size }
}
