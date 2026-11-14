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
  return TAPE_ACTS.includes(st?.act)
}
