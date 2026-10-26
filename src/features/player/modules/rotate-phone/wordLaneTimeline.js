// Раскладка и время вертикальной игры «Повтори за диктором» (RotatePhoneModule). Чистые функции — без React и DOM, проверяются тестами.
// Сцена меряется в ПРОЦЕНТАХ экрана (x — от левого края, y — от верхнего): вёрстка и линия живут в одной сетке, пересчёта под размер экрана нет.
// Три дорожки — три равные колонки, разделённые линиями. В каждой стоит вертикальная пилюля (пустая, без надписей); пилюли стоят лесенкой: первая (слева) почти внизу,
// вторая в центре экрана, третья (справа) наверху. Снизу из-за экрана поднимается ГОРИЗОНТАЛЬНАЯ линия на всю ширину (прямая, не изгибается). Когда она входит в пилюлю, пилюля
// заливается снизу вверх ровно до линии — заливка и линия одно движение. Начало заливки = начало слова, полная пилюля = конец слова: скорость линии внутри пилюли
// задаёт скорость речи диктора (высота пилюли / длительность слова). В фазе ученика линия поднимается так же, но подчиняется распознаванию (stepSpeakFront).

export const SLOT_COUNT = 3
export const LANE_X = [100 / 6, 50, 500 / 6]                // середины дорожек, % ширины
export const LANE_EDGES = [100 / 3, 200 / 3]                // разделители дорожек, % ширины
export const PILL_W = 22                                    // ширина пилюли, % ширины экрана
// Пилюли лесенкой: top/bottom — край в % высоты. Линия идёт снизу вверх: сначала нижний край (bottom), потом верхний (top)
export const PILLS = [
  { x: LANE_X[0], top: 68, bottom: 88 },
  { x: LANE_X[1], top: 40, bottom: 60 },
  { x: LANE_X[2], top: 12, bottom: 32 },
]
export const WORD_Y = 6                                     // центр слова наверху, % высоты
export const LINE_START_Y = 106                             // линия стартует за нижним краем экрана
export const LINE_END_Y = -6                                // и уходит за верхний

// Длительности, мс
export const DROP_MS = 1000        // слово падает и замирает
export const LANES_MS = 900        // дорожки и пилюли проявляются
export const FILL_MS = 1000        // заливка одной пилюли по умолчанию (слово без озвучки автора)
export const TURN_MS = 2200        // плашка «Теперь твоя очередь»
export const MIC_IN_MS = 600       // иконка микрофона выезжает снизу
export const EXIT_MS = 1000        // после последней заливки линия уходит за верх экрана
export const EXIT_TAIL_MS = 500    // и ещё столько до следующего шага

/** Опорные точки головы линии: [мс от старта линии, y %]. at[k] — слово k началось (линия у нижнего края пилюли), ms[k] — слово звучит (линия идёт сквозь пилюлю до верхнего края) */
export function buildAnchors(at, ms) {
  const pts = [[0, LINE_START_Y]]
  at.forEach((t, k) => { pts.push([t, PILLS[k].bottom], [t + ms[k], PILLS[k].top]) })
  pts.push([at.at(-1) + ms.at(-1) + EXIT_MS, LINE_END_Y])
  return pts
}

// Расписание по умолчанию (слово без озвучки автора): первое слово через 1,2 с, дальше шаг PERIOD_MS (заливка + пауза)
export const PERIOD_MS = 1600
export const FILL_AT = [1200, 1200 + PERIOD_MS, 1200 + PERIOD_MS * 2]
export const LISTEN_ANCHORS = buildAnchors(FILL_AT, FILL_AT.map(() => FILL_MS))
export const LISTEN_MS = LISTEN_ANCHORS.at(-1)[0] + EXIT_TAIL_MS

/** Голова линии (y, %) в фазе диктора через t мс после старта линии. Между опорными точками — линейно */
export function frontAtListen(t, anchors = LISTEN_ANCHORS) {
  if (!(t > 0)) return anchors[0][1]
  for (let i = 1; i < anchors.length; i++) {
    const [t1, y1] = anchors[i]
    if (t <= t1) {
      const [t0, y0] = anchors[i - 1]
      return t1 === t0 ? y1 : y0 + ((y1 - y0) * (t - t0)) / (t1 - t0)
    }
  }
  return anchors.at(-1)[1]
}

/** Насколько залита пилюля k, когда линия на высоте front: 0 — линия ниже её дна, 1 — выше верха. Заливка = то, что линия уже прошла */
export function pillProgress(front, k) {
  const { top, bottom } = PILLS[k]
  return Math.min(1, Math.max(0, (bottom - front) / (bottom - top)))
}

// Фаза ученика. Голова едет вверх к «точке ожидания» — нижнему краю ближайшей пустой пилюли — и стоит там, пока ученик не скажет слово.
export const SPEAK_SPEED = 14        // % высоты в секунду — спокойный подъём, пока ждём голос
export const CATCH_SPEED = 36        // быстрее, когда слово принято: линия проходит пилюлю (≈0,55 с на пилюлю)
export const EXIT_SPEED = 46         // уход за верх экрана после третьего слова
export const MISS_KICK = 4           // % назад (вниз), когда сказано не то слово

/** Куда должна прийти голова при hits принятых словах: нижний край следующей пустой пилюли, а после третьего слова — за экран */
export function speakTarget(hits) {
  return hits >= SLOT_COUNT ? LINE_END_Y : PILLS[hits].bottom
}

/** Один кадр головы линии ученика: идёт к цели со скоростью, зависящей от того, что случилось (принято слово — рывок вперёд). dt — секунды */
export function stepSpeakFront({ front, dt, hits, caught = false }) {
  const target = speakTarget(hits)
  const speed = hits >= SLOT_COUNT ? EXIT_SPEED : caught ? CATCH_SPEED : SPEAK_SPEED
  const move = speed * Math.max(0, dt)
  if (front > target) return Math.max(target, front - move)
  return Math.min(target, front + move) // цель может оказаться ниже головы (после «отшатывания»)
}

/** Голова после ошибочного слова: отходит назад (вниз), но не дальше чем на MISS_KICK ниже края следующей пилюли и не за нижний край экрана; голову, что и так ниже, не поднимает */
export const kickBack = (front, hits) => Math.max(front, Math.min(LINE_START_Y, front + MISS_KICK, speakTarget(Math.min(hits, SLOT_COUNT - 1)) + MISS_KICK))

/** Распорядок игры: сколько длится каждая фаза без ожидания ученика, мс */
export const PHASE_MS = { drop: DROP_MS, lanes: LANES_MS, listen: LISTEN_MS, turn: TURN_MS }
