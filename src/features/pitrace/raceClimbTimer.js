// Общий таймер «Вершины» (CONCEPT_RACE.md, раунд 3) — чистые функции без React и без часов: время приходит аргументом now (мс, performance.now).
// Таймер один на весь подъём, на ступенях своего времени нет. Старт — на первом заходе (c.t0), полоска сверху экрана; каждая взятая ступень (win) добавляет время.
// Время вышло — подъём заканчивается на той ступени, где стоит альпинист (raceLadder.timeOut), Пит говорит race_climb_time.
export const CLIMB_START_MS = 12000        // сколько времени дано на подъём в самом начале
export const CLIMB_BONUS_MS = 5000         // сколько времени добавляет каждая взятая ступень (повторно взятая после соскальзывания — тоже)
export const CLIMB_BAR_FULL_MS = CLIMB_START_MS + CLIMB_BONUS_MS // полоска полна при остатке не меньше этого (выше не растёт)
export const CLIMB_STEP_SPEED = 0.1        // пилюля ступени движка едет в 10 раз медленнее конвейера: её собственное «не успел» (≈ 36 с) почти недостижимо, время ограничивает только общий таймер
export const CLIMB_PILL_Y0 = 2             // и стоит уже на экране (центр на 2 % высоты), а не выезжает из-за края: слушать можно сразу

/** Сколько времени дано всего: старт + добавки за взятые ступени */
export const budgetMs = wins => CLIMB_START_MS + CLIMB_BONUS_MS * wins

/** Сколько осталось, мс (до старта таймера — полный запас старта); не меньше нуля */
export const leftMs = (c, now) => (c?.t0 == null ? CLIMB_START_MS : Math.max(0, budgetMs(c.wins) - (now - c.t0)))

/** Время вышло: таймер стартовал, вершины нет, остаток нуль */
export const isOut = (c, now) => !!c && c.t0 != null && !c.top && !c.timedOut && leftMs(c, now) <= 0

/** Доля полоски 0…1 (остаток к CLIMB_BAR_FULL_MS) */
export const barFraction = (c, now) => Math.min(1, leftMs(c, now) / CLIMB_BAR_FULL_MS)
