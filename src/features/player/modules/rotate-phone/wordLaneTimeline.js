// Раскладка и время вертикальной игры «Повтори за диктором» (RotatePhoneModule). Чистые функции — без React и DOM, проверяются тестами.
// Сцена меряется в ПРОЦЕНТАХ экрана (x — от левого края, y — от верхнего): вёрстка и линии рисуются в одной сетке, пересчёта под размер экрана нет.
// Три дорожки — три колонки, слои стоят на них в шахматном порядке: слева выше всех, справа ниже всех. Линия растёт из-под слова и опускается по дорожкам;
// как только её «голова» (front) доходит до слоя, слой заливается цветом (и звучит слово). В фазе ученика линия опускается так же, но её голова подчиняется распознаванию (stepSpeakFront).

export const SLOT_COUNT = 3
export const LANES_X = [18, 50, 82]                         // середины дорожек, % ширины
export const SLOTS = [{ x: 18, y: 38 }, { x: 50, y: 53 }, { x: 82, y: 68 }] // центры слоёв (шахматный порядок), % высоты
export const WORD_Y = 15                                    // центр слова наверху, % высоты
export const LINE_START_Y = 23                              // линия растёт из-под слова отсюда, % высоты
export const LINE_END_Y = 112                               // голова за нижним краем — линия «ушла»

// Длительности, мс
export const DROP_MS = 1000        // слово падает и замирает
export const LANES_MS = 900        // дорожки и слои проявляются
export const FILL_MS = 1000        // заливка одного слоя
export const TURN_MS = 2200        // плашка «Теперь твоя очередь»
export const MIC_IN_MS = 600       // иконка микрофона выезжает снизу
export const EXIT_TAIL_MS = 500    // после ухода линии ещё столько до следующего шага

// Опорные точки головы линии в фазе диктора: [мс от старта линии, y %]. Между точками — линейно. Первое прибытие к слою — через 1,5 с, дальше слои идут с шагом PERIOD_MS
// (заливка FILL_MS + пауза), после третьего слоя линия ускоряется и уходит за экран.
export const PERIOD_MS = 1600
export const LISTEN_ANCHORS = [
  [0, LINE_START_Y],
  [1500, SLOTS[0].y],
  [1500 + PERIOD_MS, SLOTS[1].y],
  [1500 + PERIOD_MS * 2, SLOTS[2].y],
  [1500 + PERIOD_MS * 2 + 1200, LINE_END_Y],
]
/** Моменты (мс от старта линии), когда голова доходит до слоя k: заливка и голос диктора начинаются ровно тогда */
export const FILL_AT = [LISTEN_ANCHORS[1][0], LISTEN_ANCHORS[2][0], LISTEN_ANCHORS[3][0]]
export const LISTEN_MS = LISTEN_ANCHORS.at(-1)[0] + EXIT_TAIL_MS

/** Голова линии (y, %) в фазе диктора через t мс после старта */
export function frontAtListen(t, anchors = LISTEN_ANCHORS) {
  if (!(t > 0)) return anchors[0][1]
  for (let i = 1; i < anchors.length; i++) {
    const [t1, y1] = anchors[i]
    if (t <= t1) {
      const [t0, y0] = anchors[i - 1]
      return y0 + ((y1 - y0) * (t - t0)) / (t1 - t0)
    }
  }
  return anchors.at(-1)[1]
}

// Фаза ученика. Голова линии едет к «точке ожидания» перед следующим ещё не заполненным слоем и там стоит, пока ученик не скажет слово.
export const HOLD_GAP = 5            // стоит на столько % выше центра слоя (у его верхней кромки)
export const SPEAK_SPEED = 9         // % высоты в секунду — спокойный спуск, пока ждём голос
export const CATCH_SPEED = 34        // быстрее, когда слово принято: линия «проскакивает» слой
export const EXIT_SPEED = 46         // уход за экран после третьего слова
export const MISS_KICK = 4           // % назад, когда сказано не то слово (линия «отшатывается»)

/** Куда должна прийти голова при hits принятых словах */
export function speakTarget(hits) {
  if (hits >= SLOT_COUNT) return LINE_END_Y
  return SLOTS[hits].y - HOLD_GAP
}

/** Один кадр головы линии ученика: идёт к цели со скоростью, зависящей от того, что случилось (принято слово — рывок вперёд). dt — секунды */
export function stepSpeakFront({ front, dt, hits, caught = false }) {
  const target = speakTarget(hits)
  const speed = hits >= SLOT_COUNT ? EXIT_SPEED : caught ? CATCH_SPEED : SPEAK_SPEED
  const move = speed * Math.max(0, dt)
  if (front < target) return Math.min(target, front + move)
  return Math.max(target, front - move) // цель может оказаться выше (после «отшатывания»)
}

/** Голова после ошибочного слова: отходит назад, но не выше начала линии */
export const kickBack = front => Math.max(LINE_START_Y, front - MISS_KICK)

/** Распорядок игры: сколько длится каждая фаза без ожидания ученика, мс. Нужна и тестам, и CSS-сторожу */
export const PHASE_MS = { drop: DROP_MS, lanes: LANES_MS, listen: LISTEN_MS, turn: TURN_MS }
