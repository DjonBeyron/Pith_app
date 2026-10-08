// Константы геометрии и движения шариков-спойлера (без кода) — общие для сборки сетки (phraseBubbleGrid.js) и
// отрисовки/взрыва (phraseBubbleDraw.js). Вынесены, чтобы сетка и рисовалка не импортировали друг друга по кругу.

export const SPACING = 1.27
export const RADIUS = 0.55
// Максимальные множители радиуса у основной сетки/бахромы (см. phraseBubbleGrid.js: push(..., sizeScale) и формулу r) —
// нужны, чтобы честно посчитать MARGIN ниже, а не подбирать его на глаз
const RADIUS_SCALE_MAX = 1.4
const FRINGE_SCALE_MAX = 1.05
// Амплитуда пульсации радиуса — «дыхание» шарика в drawFloat (см. pulse)
export const PULSE_AMP = 0.22
const MAX_RADIUS = RADIUS * Math.max(RADIUS_SCALE_MAX, FRINGE_SCALE_MAX) * (1 + PULSE_AMP)
// Путь колебания (не скорость — она отдельно в speed у каждого шарика)
export const AMP_MAX = 4.5
// Вертикальный размах меньше горизонтального — полоса шариков тоньше по высоте (ближе к высоте самого текста)
export const WANDER_Y_SCALE = 0.45
// Вторая (более быстрая) синусоида в wiggle-дрейфе — доля от amp (см. drawFloat)
export const WIGGLE_SECOND_RATIO = 0.35
const MAX_WANDER = AMP_MAX * (1 + WIGGLE_SECOND_RATIO)
const MAX_WANDER_Y = MAX_WANDER * WANDER_Y_SCALE
export const BLUR_PX = 0.4
// Максимальная глубина «бахромы» шариков за прямоугольником сетки. По вертикали (верх/низ) бахрома тоже мельче
export const FRINGE_DEPTH_MAX = SPACING * 3.2
export const FRINGE_DEPTH_MAX_Y = FRINGE_DEPTH_MAX * WANDER_Y_SCALE
// Запас канваса вокруг текста: макс. радиус + макс. размах покачивания + глубина бахромы + блюр — шарики на пике
// покачивания/пульсации иначе срезались бы краем канваса. По высоте запас меньше (см. WANDER_Y_SCALE)
export const MARGIN_X = Math.ceil(MAX_RADIUS + MAX_WANDER + FRINGE_DEPTH_MAX + BLUR_PX * 2 + 2)
export const MARGIN_Y = Math.ceil(MAX_RADIUS + MAX_WANDER_Y + FRINGE_DEPTH_MAX_Y + BLUR_PX * 2 + 2)

// ── Режим «облачка по словам» («Ловля слов») ───────────────────────────────────────────────────────────────────────
// Доля узлов от плотности ленточного спойлера: сетка и бахрома реже в 1/REGION_DENSITY раз. Измерено (buildGrid, фраза из
// 5 слов по 17px, зазоры ~20px): при плотности ленты было ~6400 узлов (~4900 сетки + бахрома), canvas рисовал их
// 24 раза в секунду — главная нагрузка на главный поток и GPU во время набора. С 0.22 — ~1400 (цель ≤ 1500).
export const REGION_DENSITY = 0.22
// Радиус шариков облачка больше (в ленте 1): реже узлы + крупнее точки — облачко остаётся «пухлым». Ровно сохранять
// покрытие (1/sqrt(REGION_DENSITY) ≈ 2.1) не нужно: крупные точки читались бы зернистыми, да и запас до соседа тесен
export const REGION_RADIUS_SCALE = 1.7

// ── Взрыв («растворение») ──────────────────────────────────────────────────────────────────────────────────────────
// Растворение облачка в 1,37 раза медленнее прежнего (было 750мс): ВСЯ физика растянута во времени одинаково (скорости и
// трение — см. phraseBubbleFlight.js), поэтому траектории те же, что были, просто идут медленнее
export const EXPLODE_SLOW = 1.37
export const EXPLODE_MS = Math.round(750 * EXPLODE_SLOW)
