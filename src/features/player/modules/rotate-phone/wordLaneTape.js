// «Встряхни память», этап 2 «Фразы»: три дорожки съехались в одну широкую ленту (word-lane-wide.css по data-tape на корне игры, WordLaneGame). Чистая функция: по состоянию игры f — лента сейчас или нет.
// Лента держится и на паузе: f.stage 'paused' не роняет её (на паузе stageObj нет — раньше дорожки на паузе разъезжались, а после «Продолжить» съезжались заново, переходной анимацией);
// перезапуск ступени (restartStage) остаётся в том же акте — атрибут не меняется, и лента сразу в своём виде. По data-tape привод конвейера ведёт узор со скоростью пилюль (laneConveyorDrive.js), а вспышка верного ответа
// покрывает всю ленту (wordLaneLaneFlash.js).
export const TAPE_ACT = 'phrases'
export const TAPE_ACTS = [TAPE_ACT, 'boss'] // и финал «Шкала памяти» (boss/): слова по одному на той же широкой ленте

/** Лента ли сейчас: акт текущей стадии (на паузе — стадии, на которой встали) — этап «Фразы» */
export function laneTape(f) {
  if (!f?.rh?.on) return false
  const st = f.stage === 'run' ? f.stageObj : f.stage === 'paused' && f.from === 'run' ? f.stages?.[f.idx] : null
  if (!st && f.stage === 'reveal') return TAPE_ACTS.includes(f.stages?.at(-1)?.act) // после финала (Пит говорит «финиш, завтра ещё заезд») дорожки остаются широкой лентой, а не перестраиваются в три (владелец v3.3.284)
  return TAPE_ACTS.includes(st?.act)
}

/** Обратный конвейер ли сейчас (проход B «Конвейера слов»: слова едут снизу вверх, step.reverse): стадия ступени ученика, на паузе — та, на которой встали. По нему (data-up на корне игры) узор дорожек бежит вверх */
export function laneUp(f) {
  if (!f?.rh?.on) return false
  const st = f.stage === 'run' ? f.stageObj : f.stage === 'paused' && f.from === 'run' ? f.stages?.[f.idx] : null
  return !!(st?.step?.reverse || st?.revBack || (st?.mia === 'intro' && st.act === 'catch')) // и плашка «Допрос у Мии» / церемония после B: конвейер ещё идёт вверх, пока разворот не поменяет его (raceReverseTurn, back)
}
