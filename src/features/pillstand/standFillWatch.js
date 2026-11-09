// «Слово → заливка дошла» для стенда пилюль (CONCEPT_PILLSTAND.md, задержки): слово услышано (или повтор принят) — запоминаем момент и цель заливки в этот миг; как только цель выросла (не выросла за GOAL_WAIT_MS — слово не двигало заливку, отметка снимается),
// ждём кадра, где экран догнал новую цель (EPS) → { word, ms } — сколько мс от слова до заливки на экране. Кадр зовёт frame(t, goal, shown). Чистый модуль.
export const EPS = 0.012
export const GIVE_UP_MS = 4000
export const GOAL_WAIT_MS = 400 // цель после слова так и не выросла (подтверждение уже засчитанного слова) — не ждём

export function createFillWatch() {
  let marks = []
  return {
    /** Слово word услышано в момент t (мс сессии), цель заливки сейчас goal */
    word(t, word, goal) { marks.push({ t, word, base: goal ?? 0, target: null }) },
    /** Кадр: → [{ word, ms }] — слова, до которых экран дошёл в этом кадре */
    frame(t, goal, shown) {
      const out = []
      marks = marks.filter(m => {
        if (t - m.t > GIVE_UP_MS || (m.target == null && t - m.t > GOAL_WAIT_MS && !(goal > m.base + 1e-4))) return false
        if (goal > m.base + 1e-4) m.target = Math.max(m.target ?? 0, goal)
        if (m.target != null && shown >= m.target - EPS) { out.push({ word: m.word, ms: Math.round(t - m.t) }); return false }
        return true
      })
      return out
    },
    reset() { marks = [] },
  }
}
