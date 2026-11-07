// Плавная заливка пилюли НА ЭКРАНЕ. Логика (wordLaneStudent.stepFill, сцена фраз racePhraseScene) задаёт ЦЕЛЬ заливки по событиям — голос, черновик распознавания (partial), итог, принятие;
// цель может прыгать (пришёл черновик — сразу +35 % слова, «аванс»; русская выдержка кончилась — до 100 %; слово фразы услышано — +доля слова). На экран идёт не цель, а значение, которое КАЖДЫЙ КАДР
// идёт к ней с постоянной скоростью: вверх FILL_UP_PER_S, вниз FILL_DOWN_PER_S (мягче — заливка «выдыхается», а не обрывается); за один кадр — не больше FILL_MAX_STEP (без ступенек больше 15 %
// даже при длинном кадре на слабом телефоне). Плавная цель (дыхание голосом) проходит почти без задержки, скачок цели превращается в ровный подъём. Раньше заливку вела только экспонента с постоянной
// 75 мс: скачок цели 0 → 0,85 давал 16 % за кадр при 60 fps и до 40 % при кадре 50 мс, а заливка фразы перерисовывалась лишь по событию слова — ступенями. Чистый модуль без DOM: время — аргументом.
export const FILL_UP_PER_S = 2.5     // вверх: скачок 0 → 0,85 — ровно за ≈ 0,34 с
export const FILL_DOWN_PER_S = 1.2   // вниз мягче
export const FILL_MAX_STEP = 0.12    // потолок шага за кадр
export const FILL_DT_MAX_MS = 100    // кадр длиннее (вкладка спала, сборка мусора) считаем за столько: после паузы заливка не прыгает
export const FILL_ADVANCE = 0.35     // «аванс»: первый же черновик распознавания — цель сразу не ниже 35 % вклада слова (заливка не стоит, пока ждём следующий partial или выдержку)

const clamp01 = v => Math.min(1, Math.max(0, Number(v) || 0))

/** Один кадр: cur — что на экране, goal — цель (0…1), dtMs — мс с прошлого кадра → новое значение на экране */
export function approachFill(cur, goal, dtMs) {
  const g = clamp01(goal), dt = Math.min(FILL_DT_MAX_MS, Math.max(0, dtMs)) / 1000
  return g >= cur ? Math.min(g, cur + Math.min(FILL_MAX_STEP, FILL_UP_PER_S * dt)) : Math.max(g, cur - Math.min(FILL_MAX_STEP, FILL_DOWN_PER_S * dt))
}

// Адаптивный догон (заливка фразы «Скажи», замечание владельца 2026-11-07: «говорю быстро — пилюля должна заполняться быстро, без остановок, а не по шагам»): вверх шаг кадра — большее из
// линейного FILL_UP_PER_S·dt и экспоненты lag·(1 − e^(−dt/FAST_TAU_MS)): большое отставание (быстрая речь — цель ушла на несколько слов) закрывается одним плавным движением за ≈ 3·τ ≈ 0,2 с,
// маленькое — с той же скоростью 2,5/с, что раньше; у цели шаг обрезается ровно по цели (без перелёта и дрожи). Потолок кадра мягче — FILL_MAX_STEP_FAST. Вниз — как approachFill.
export const FAST_TAU_MS = 70
export const FILL_MAX_STEP_FAST = 0.3

/** Один кадр адаптивного догона: cur — что на экране, goal — цель, dtMs — мс с прошлого кадра */
export function approachFillFast(cur, goal, dtMs) {
  const g = clamp01(goal), ms = Math.min(FILL_DT_MAX_MS, Math.max(0, dtMs))
  if (g < cur) return approachFill(cur, g, dtMs)
  const step = Math.max(FILL_UP_PER_S * ms / 1000, (g - cur) * (1 - Math.exp(-ms / FAST_TAU_MS)))
  return Math.min(g, cur + Math.min(FILL_MAX_STEP_FAST, step))
}

/** Заливки нескольких пилюль: step(id, goal, dtMs) → значение на экране; value(id) — что на экране; forget(id) — пилюля ушла (следующая с тем же id начнёт с нуля); approach — кривая догона */
export function createFillView(approach = approachFill) {
  const shown = new Map()
  return {
    step(id, goal, dtMs) { const v = approach(shown.get(id) ?? 0, goal, dtMs); shown.set(id, v); return v },
    value: id => shown.get(id) ?? 0,
    forget: id => { shown.delete(id) },
  }
}
