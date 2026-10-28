// Числа оценки уровня (A2, PLAN_NEW_USER.md). Все настройки модели — здесь,
// формулы — в levelModel.js. Уровень — на шкале 0..1: 0 — совсем новичок,
// 1 — свободно. Две оси: ear (понимание на слух) и vocab (словарь).

// Цель: столько верных ответов в заданиях («правило 85%», 80–85%)
export const TARGET_OK = 0.85

// Сложность слайда 1/2/3 (curricula.difficulty) → точка на шкале уровня
export const DIFF_TO_LEVEL = { 1: 0.25, 2: 0.5, 3: 0.75 }

// Начало: «не знаем» — середина шкалы и большая неопределённость
export const INITIAL = { level: 0.5, sigma: 0.35 }
export const SIGMA_MIN = 0.08

// Шум одного наблюдения (при весе 1). Меньше вес — тем «шумнее» наблюдение
export const OBS_NOISE = 0.25

// Насколько уровень тянется выше сложности при верном ответе и ниже — при
// неверном. Соотношение выводится из TARGET_OK: на материале «по уровню»
// доля верных в равновесии получается ровно TARGET_OK
export const MARGIN_OK = 0.06
export const MARGIN_FAIL = MARGIN_OK * TARGET_OK / (1 - TARGET_OK)

// Насколько уверенное наблюдение каждого типа (0..1)
export const SIGNAL_WEIGHT = {
  answer: 1.0,        // lesson_answer, scene_task_answer, catch_answer
  start_result: 1.0,  // итог Старта
  pit_answer: 1.0,    // ответ Пита (B3)
  watched: 0.4,       // досмотр до конца
  hard_sign: 0.3,     // feed_slow / feed_reveal / feed_phrase_open
  difficulty_vote: 0.3,
  quick_skip: 0.2,    // быстрый пролист
  // Итог «лесенки» второго визита (feed_ladder): потолок «спокойно» и первая трудная ступень. Надёжнее одиночного досмотра
  // (0.4) и признака трудности (0.3): пять фраз по нарастанию сложности смотрит один человек подряд, поэтому сравнение
  // «до какой сложности было спокойно» убирает шум отдельного слайда (интерес к теме, отвлёкся). Но те же слайды уже
  // учтены по отдельности (watched / hard_sign / quick_skip), поэтому вес умеренный, а не 1.0: лесенка добавляет
  // уверенность в потолке и в нижней границе, а не ещё одно полноценное наблюдение за каждый слайд
  ladder: 0.5,
}

// «Слишком легко/сложно» для быстрого пролиста: разница сложности слайда и уровня
export const SKIP_CONTEXT_GAP = 0.2

// Ответ Пита «всё хорошо» чуть уменьшает неопределённость; «слишком просто» —
// наблюдение на столько выше текущего уровня
export const FINE_SIGMA_SHRINK = 0.97
export const TOO_EASY_LIFT = 0.15

// Итог Старта: доля верных 0..1 → уровень словаря = START_BASE + START_SPAN * доля
export const START_BASE = 0.15
export const START_SPAN = 0.7

// Рывок: раз в JUMP_EVERY слайдов — на ступень выше
export const JUMP_EVERY = 5
export const JUMP_STEP = 0.25

// Границы слов для описания (describeLevel) и «уверенности»
export const LOW_BELOW = 0.4
export const HIGH_FROM = 0.65
export const CONFIDENT_SIGMA = 0.2
