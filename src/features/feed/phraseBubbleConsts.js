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
